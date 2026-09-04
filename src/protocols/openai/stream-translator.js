// src/protocols/openai/stream-translator.js
// Bidirectional streaming translator between OpenAI SSE chunks and CanonicalStreamChunk events.

import { CanonicalStream, STREAM_EVENT_TYPES, createCanonicalStreamChunk } from '../../canonical/events.js';
import { mapFinishReason } from './response-translator.js';

/**
 * Initialize a state tracker for transforming an OpenAI SSE chunk stream into CanonicalStreamChunks.
 * @param {string} [targetModel]
 * @returns {Object}
 */
export function createOpenAiStreamState(targetModel = '') {
  return {
    targetModel,
    messageStarted: false,
    messageId: '',
    model: '',
    textStarted: false,
    textBlockIndex: 0,
    contentIndex: 0,
    activeTools: new Map(), // tcIndex -> { id, name, blockIndex }
    completed: false,
  };
}

/**
 * Transforms an individual OpenAI SSE chunk (JSON object) into zero or more CanonicalStreamChunk events.
 * @param {Record<string, any>} chunk
 * @param {ReturnType<typeof createOpenAiStreamState>} state
 * @returns {Array<import('../../canonical/events.js').CanonicalStreamChunk>}
 */
export function openAiChunkToCanonicalEvents(chunk, state) {
  if (!chunk || typeof chunk !== 'object') return [];
  const events = [];

  const choice = chunk.choices?.[0] || {};
  const delta = choice.delta || {};

  // 1. Message Start
  if (!state.messageStarted) {
    state.messageStarted = true;
    state.messageId = chunk.id || `msg_${Math.random().toString(36).slice(2, 11)}`;
    state.model = chunk.model || state.targetModel || '';
    events.push(CanonicalStream.messageStart(state.messageId, state.model));
  }

  // 2. Text Content Delta
  if (typeof delta.content === 'string' && delta.content.length > 0) {
    if (!state.textStarted) {
      state.textStarted = true;
      state.textBlockIndex = state.contentIndex++;
      events.push(CanonicalStream.contentBlockStart(state.textBlockIndex, 'text'));
    }
    events.push(CanonicalStream.textDelta(state.textBlockIndex, delta.content));
  }

  // 3. Tool Call Deltas
  if (Array.isArray(delta.tool_calls)) {
    for (const tc of delta.tool_calls) {
      if (!tc || typeof tc !== 'object') continue;
      const tcIndex = Number.isFinite(tc.index) ? tc.index : 0;

      if (!state.activeTools.has(tcIndex)) {
        const toolMeta = {
          id: tc.id || `call_${Math.random().toString(36).slice(2, 11)}`,
          name: tc.function?.name || '',
          blockIndex: state.contentIndex++,
        };
        state.activeTools.set(tcIndex, toolMeta);
        events.push(
          createCanonicalStreamChunk(STREAM_EVENT_TYPES.CONTENT_BLOCK_START, {
            index: toolMeta.blockIndex,
            blockType: 'tool_use',
            id: toolMeta.id,
            name: toolMeta.name,
          })
        );
      }

      const active = state.activeTools.get(tcIndex);
      if (tc.function?.name && !active.name) {
        active.name = tc.function.name;
      }
      if (tc.function?.arguments) {
        events.push(CanonicalStream.toolCallDelta(active.blockIndex, tc.function.arguments));
      }
    }
  }

  // 4. Finish Reason / Stream Completion
  if (choice.finish_reason) {
    if (state.textStarted) {
      events.push(CanonicalStream.contentBlockStop(state.textBlockIndex));
      state.textStarted = false;
    }
    for (const active of state.activeTools.values()) {
      events.push(CanonicalStream.contentBlockStop(active.blockIndex));
    }

    const stopReason = mapFinishReason(choice.finish_reason, state.activeTools.size > 0);
    const usage = chunk.usage
      ? {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        }
      : undefined;

    events.push(CanonicalStream.messageDelta(stopReason, usage));
    events.push(CanonicalStream.messageStop());
    state.completed = true;
  }

  return events;
}

/**
 * Consumes an async stream of raw OpenAI SSE data and yields CanonicalStreamChunk events.
 * @param {ReadableStream | import('node:stream').Readable | AsyncIterable<string | Buffer | Uint8Array>} stream
 * @param {string} [targetModel]
 * @returns {AsyncGenerator<import('../../canonical/events.js').CanonicalStreamChunk>}
 */
export async function* streamOpenAiToCanonical(stream, targetModel = '') {
  const state = createOpenAiStreamState(targetModel);
  const dec = new TextDecoder();
  let lineBuffer = '';

  for await (const rawChunk of stream) {
    const text = typeof rawChunk === 'string' ? rawChunk : dec.decode(rawChunk, { stream: true });
    lineBuffer += text;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop(); // Retain partial trailing line

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(':')) continue; // Skip comments/empty lines
      if (line === 'data: [DONE]') {
        if (!state.completed) {
          if (state.textStarted) {
            yield CanonicalStream.contentBlockStop(state.textBlockIndex);
            state.textStarted = false;
          }
          yield CanonicalStream.messageDelta('end_turn');
          yield CanonicalStream.messageStop();
          state.completed = true;
        }
        continue;
      }
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          const canonicalEvents = openAiChunkToCanonicalEvents(parsed, state);
          for (const ev of canonicalEvents) {
            yield ev;
          }
        } catch {
          // Ignore invalid chunk lines
        }
      }
    }
  }

  // Flush remaining buffer if any
  if (lineBuffer.trim().startsWith('data: ')) {
    const jsonStr = lineBuffer.trim().slice(6).trim();
    if (jsonStr && jsonStr !== '[DONE]') {
      try {
        const parsed = JSON.parse(jsonStr);
        const canonicalEvents = openAiChunkToCanonicalEvents(parsed, state);
        for (const ev of canonicalEvents) {
          yield ev;
        }
      } catch {}
    }
  }

  if (!state.completed && state.messageStarted) {
    yield CanonicalStream.messageStop();
    state.completed = true;
  }
}

/**
 * Serializes a CanonicalStreamChunk into OpenAI-compatible SSE line.
 * @param {import('../../canonical/events.js').CanonicalStreamChunk} chunk
 * @param {Object} [meta]
 * @returns {string}
 */
export function canonicalChunkToOpenAiSse(chunk, meta = {}) {
  const id = meta.id || 'chatcmpl_tb';
  const model = meta.model || 'gpt-4o';
  const created = meta.created || Math.floor(Date.now() / 1000);

  if (chunk.type === STREAM_EVENT_TYPES.MESSAGE_START) {
    const payload = {
      id: chunk.id || id,
      object: 'chat.completion.chunk',
      created,
      model: chunk.model || model,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    };
    return `data: ${JSON.stringify(payload)}\n\n`;
  }

  if (chunk.type === STREAM_EVENT_TYPES.TEXT_DELTA) {
    const payload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }],
    };
    return `data: ${JSON.stringify(payload)}\n\n`;
  }

  if (chunk.type === STREAM_EVENT_TYPES.CONTENT_BLOCK_START && chunk.blockType === 'tool_use') {
    const payload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: chunk.index || 0,
                id: chunk.id,
                type: 'function',
                function: { name: chunk.name || '', arguments: '' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
    return `data: ${JSON.stringify(payload)}\n\n`;
  }

  if (chunk.type === STREAM_EVENT_TYPES.TOOL_CALL_DELTA) {
    const payload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: chunk.index || 0,
                function: { arguments: chunk.argumentsChunk },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
    return `data: ${JSON.stringify(payload)}\n\n`;
  }

  if (chunk.type === STREAM_EVENT_TYPES.MESSAGE_DELTA) {
    const finishReason = chunk.stopReason === 'tool_use' ? 'tool_calls' : 'stop';
    const payload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    };
    if (chunk.usage) {
      payload.usage = {
        prompt_tokens: chunk.usage.inputTokens,
        completion_tokens: chunk.usage.outputTokens,
        total_tokens: chunk.usage.totalTokens,
      };
    }
    return `data: ${JSON.stringify(payload)}\n\n`;
  }

  if (chunk.type === STREAM_EVENT_TYPES.MESSAGE_STOP) {
    return 'data: [DONE]\n\n';
  }

  return '';
}
