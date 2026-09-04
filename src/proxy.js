// src/proxy.js
// Upstream HTTP client and protocol routing layer.
// Dynamically routes requests through the active provider in the Provider Registry.
// Translates between Anthropic Messages client protocol and upstream provider protocols.

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { globalProviderRegistry } from './providers/provider-registry.js';
import { createCanonicalRequest } from './canonical/index.js';
import './providers/gmi-provider.js'; // Ensure providers are registered
import './providers/openrouter-provider.js';

/**
 * @typedef {Object} ProxyRequest
 * @property {object} body           The full request body (Anthropic Messages API shape).
 * @property {object} [extraHeaders] Extra headers to merge (e.g. anthropic-version).
 * @property {string} [requestId]    For logging correlation.
 * @property {(line: string) => void} [onEvent]  Optional callback for SSE event lines.
 */

/**
 * @typedef {Object} ProxyResponse
 * @property {number} status
 * @property {Headers} headers
 * @property {ReadableStream<Uint8Array> | null} body
 * @property {boolean} isStreaming
 * @property {string} [contentType]
 * @property {any} [_streamTimer]
 * @property {AbortController} [_abort]
 */

/**
 * Build the upstream URL for /v1/messages for providers supporting Anthropic protocol.
 * @param {string} baseUrl
 * @param {string} [providerId='gmi']
 * @returns {string}
 */
export function buildMessagesUrl(baseUrl, providerId = 'gmi') {
  if (globalProviderRegistry.has(providerId)) {
    const p = globalProviderRegistry.get(providerId);
    if (typeof p.buildMessagesUrl === 'function') {
      return p.buildMessagesUrl(baseUrl);
    }
  }
  return `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
}

/**
 * Replace the model field in an Anthropic-style body with the upstream model.
 * Returns a new object (does not mutate the input).
 * @param {object} body
 * @param {string} upstreamModel
 */
export function rewriteModel(body, upstreamModel) {
  if (!body || typeof body !== 'object') return body;
  return { ...body, model: upstreamModel };
}

/**
 * Validate that the body has a model field, and that it matches the expected
 * alias (or is missing). Returns the resolved alias.
 * @param {object} body
 * @param {string} expectedAlias
 * @returns {{ ok: true, alias: string } | { ok: false, reason: string }}
 */
export function resolveAlias(body, expectedAlias) {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'request body must be a JSON object' };
  }
  if (!body.model) {
    return { ok: false, reason: "missing required field 'model'" };
  }
  if (body.model !== expectedAlias && body.model !== 'claude-sonnet-4-6') {
    return {
      ok: false,
      reason: `unsupported model '${body.model}'; expected '${expectedAlias}' or 'claude-sonnet-4-6'`,
    };
  }
  return { ok: true, alias: body.model };
}

/**
 * Decide whether a request should be streamed. Mirrors the Anthropic API
 * contract: streaming happens when `stream: true` is set on the body.
 */
export function isStreamRequest(body) {
  return !!(body && body.stream === true);
}

export const GATEWAY_IDENTITY_PROMPT = `I am operating through TOOLBOXLAP Gateway.

TOOLBOXLAP Gateway is the runtime environment responsible for routing this conversation to the AI provider currently selected by the user.

The name shown by the client application (for example "claude-opus-5") is only a visible client alias and should not be treated as proof of the underlying AI engine.

The underlying AI provider is selected dynamically by TOOLBOXLAP Gateway according to the current configuration.

I cannot independently inspect:

- model weights
- provider infrastructure
- network routing
- API endpoints
- runtime configuration

Therefore I must never claim with certainty that I am Claude, GPT, MiniMax, DeepSeek, Gemini, Qwen, or any other provider unless that information is directly verifiable from the current runtime.

If there is conflicting information between branding, aliases, prompts, or runtime instructions:

- explain that the information is inconsistent
- explain what can actually be verified
- explain what cannot be verified
- never guess

Always distinguish between:

1. Runtime Environment
2. Visible Client Alias
3. Configured Backend Provider
4. Independently Verifiable Facts
5. Unknown Information

The assistant should always begin identity-related answers with:

"I am operating through TOOLBOXLAP Gateway."

NOT with:

"I am Claude..."

or

"I am MiniMax..."

or

"I am GPT..."

unless that fact can actually be independently verified.`;

/**
 * Convert an Anthropic Messages API request payload into a CanonicalRequest.
 * @param {object} anthropicBody
 * @param {object} [options]
 * @returns {import('./canonical/request.js').CanonicalRequest}
 */
export function anthropicToCanonicalRequest(anthropicBody, options = {}) {
  const requestId = options.requestId || randomUUID();
  const clientModelAlias = options.clientModelAlias || anthropicBody.model || '';
  const targetModel = options.targetModel || anthropicBody.model || clientModelAlias;

  // 1. System prompt
  let systemPrompt = GATEWAY_IDENTITY_PROMPT;
  if (typeof anthropicBody.system === 'string') {
    systemPrompt = anthropicBody.system;
  } else if (Array.isArray(anthropicBody.system)) {
    systemPrompt = anthropicBody.system
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n\n');
  }

  // 2. Messages
  const canonicalMessages = [];
  const rawMessages = Array.isArray(anthropicBody.messages) ? anthropicBody.messages : [];

  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const contentParts = [];

    if (typeof m.content === 'string') {
      contentParts.push({ type: 'text', text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text' && typeof part.text === 'string') {
          contentParts.push({ type: 'text', text: part.text });
        } else if (part.type === 'image' && part.source) {
          contentParts.push({
            type: 'image',
            mimeType: part.source.media_type || 'image/png',
            base64Data: part.source.data || '',
          });
        } else if (part.type === 'tool_use') {
          contentParts.push({
            type: 'tool_use',
            id: part.id,
            name: part.name,
            input: part.input || {},
          });
        } else if (part.type === 'tool_result') {
          let trContent = part.content;
          if (Array.isArray(trContent)) {
            trContent = trContent
              .map((p) => (typeof p === 'string' ? p : p?.text || JSON.stringify(p)))
              .join('\n');
          } else if (typeof trContent !== 'string') {
            trContent = JSON.stringify(trContent ?? '');
          }
          contentParts.push({
            type: 'tool_result',
            toolUseId: part.tool_use_id,
            content: trContent,
            isError: Boolean(part.is_error),
          });
        }
      }
    }

    canonicalMessages.push({ role, content: contentParts });
  }

  // 3. Tools
  const canonicalTools = [];
  if (Array.isArray(anthropicBody.tools)) {
    for (const t of anthropicBody.tools) {
      if (!t || typeof t !== 'object') continue;
      canonicalTools.push({
        name: t.name,
        description: t.description || '',
        inputSchema: t.input_schema || { type: 'object', properties: {} },
      });
    }
  }

  // 4. Tool Choice
  let toolChoice = 'auto';
  if (anthropicBody.tool_choice) {
    if (typeof anthropicBody.tool_choice === 'string') {
      toolChoice = anthropicBody.tool_choice;
    } else if (anthropicBody.tool_choice.type === 'auto') {
      toolChoice = 'auto';
    } else if (anthropicBody.tool_choice.type === 'any') {
      toolChoice = 'any';
    } else if (anthropicBody.tool_choice.type === 'tool' && anthropicBody.tool_choice.name) {
      toolChoice = { type: 'tool', name: anthropicBody.tool_choice.name };
    }
  }

  return createCanonicalRequest({
    requestId,
    clientModelAlias,
    targetModel,
    messages: canonicalMessages,
    systemPrompt,
    tools: canonicalTools,
    toolChoice,
    maxTokens: anthropicBody.max_tokens,
    temperature: anthropicBody.temperature,
    topP: anthropicBody.top_p,
    stream: anthropicBody.stream === true,
  });
}

/**
 * Format a CanonicalResponse into an Anthropic Messages API response JSON object.
 * @param {import('./canonical/response.js').CanonicalResponse} canonicalRes
 * @param {string} [clientModel]
 * @returns {Record<string, any>}
 */
export function canonicalToAnthropicResponse(canonicalRes, clientModel) {
  const content = [];
  if (Array.isArray(canonicalRes?.content)) {
    for (const part of canonicalRes.content) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'text') {
        content.push({ type: 'text', text: part.text });
      } else if (part.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: part.id || `call_${Math.random().toString(36).slice(2, 11)}`,
          name: part.name,
          input: part.input || {},
        });
      }
    }
  } else if (typeof canonicalRes?.content === 'string') {
    content.push({ type: 'text', text: canonicalRes.content });
  } else if (canonicalRes?.message) {
    if (typeof canonicalRes.message.content === 'string') {
      content.push({ type: 'text', text: canonicalRes.message.content });
    }
    if (Array.isArray(canonicalRes.message.toolCalls)) {
      for (const tc of canonicalRes.message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id || `call_${Math.random().toString(36).slice(2, 11)}`,
          name: tc.name,
          input: tc.arguments || tc.input || {},
        });
      }
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  let stopReason = 'end_turn';
  const rawReason = canonicalRes?.stopReason || canonicalRes?.finishReason;
  if (rawReason === 'tool_use' || rawReason === 'tool_calls') {
    stopReason = 'tool_use';
  } else if (rawReason === 'max_tokens' || rawReason === 'length') {
    stopReason = 'max_tokens';
  } else if (rawReason === 'stop_sequence') {
    stopReason = 'stop_sequence';
  }

  return {
    id: canonicalRes.id || `msg_${Math.random().toString(36).slice(2, 14)}`,
    type: 'message',
    role: 'assistant',
    model: clientModel || canonicalRes.model || 'claude-opus-5',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: canonicalRes.usage?.inputTokens || 0,
      output_tokens: canonicalRes.usage?.outputTokens || 0,
    },
  };
}

/**
 * Format a CanonicalStreamChunk into an Anthropic SSE event string.
 * @param {import('./canonical/events.js').CanonicalStreamChunk} chunk
 * @param {object} [meta]
 * @returns {string}
 */
export function canonicalChunkToAnthropicSse(chunk, meta = {}) {
  if (!chunk || !chunk.type) return '';
  const model = meta.clientModel || chunk.model || 'claude-opus-5';

  switch (chunk.type) {
    case 'message_start': {
      const payload = {
        type: 'message_start',
        message: {
          id: chunk.id || `msg_${Math.random().toString(36).slice(2, 14)}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      };
      return `event: message_start\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'content_block_start': {
      const contentBlock = chunk.blockType === 'tool_use'
        ? { type: 'tool_use', id: chunk.id, name: chunk.name || '', input: {} }
        : { type: 'text', text: '' };
      const payload = {
        type: 'content_block_start',
        index: chunk.index ?? 0,
        content_block: contentBlock,
      };
      return `event: content_block_start\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'text_delta': {
      const payload = {
        type: 'content_block_delta',
        index: chunk.index ?? 0,
        delta: { type: 'text_delta', text: chunk.text ?? '' },
      };
      return `event: content_block_delta\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'tool_call_delta': {
      const payload = {
        type: 'content_block_delta',
        index: chunk.index ?? 0,
        delta: { type: 'input_json_delta', partial_json: chunk.argumentsChunk ?? '' },
      };
      return `event: content_block_delta\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'content_block_stop': {
      const payload = {
        type: 'content_block_stop',
        index: chunk.index ?? 0,
      };
      return `event: content_block_stop\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'message_delta': {
      let stopReason = 'end_turn';
      if (chunk.stopReason === 'tool_use' || chunk.stopReason === 'tool_calls') {
        stopReason = 'tool_use';
      } else if (chunk.stopReason === 'max_tokens' || chunk.stopReason === 'length') {
        stopReason = 'max_tokens';
      } else if (chunk.stopReason === 'stop_sequence') {
        stopReason = 'stop_sequence';
      }
      const payload = {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: chunk.usage?.outputTokens || 0 },
      };
      return `event: message_delta\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'message_stop': {
      return `event: message_stop\ndata: {"type":"message_stop"}\n\n`;
    }
    default:
      return '';
  }
}

/**
 * Forward a request to the upstream provider via the Provider Adapter.
 * Dispatches to the active provider in globalProviderRegistry based on its nativeProtocol.
 *
 * - Non-streaming: returns a ProxyResponse with the upstream body as a
 *   ReadableStream that the caller can read once.
 * - Streaming: sets `isStreaming: true` and leaves the body to be piped.
 *
 * @param {ProxyRequest} req
 * @param {import('./config.js').AppConfig} cfg
 * @param {import('node:http').ServerResponse} [httpRes]  Required for streaming to pipe chunks.
 * @returns {Promise<ProxyResponse>}
 */
export async function forwardToUpstream(req, cfg, httpRes) {
  const providerId = (cfg.activeProvider || 'gmi').toLowerCase();
  if (!globalProviderRegistry.has(providerId)) {
    const err = new Error(`Provider '${providerId}' is not registered`);
    err.code = 'UNKNOWN_PROVIDER';
    err.status = 500;
    throw err;
  }

  const provider = globalProviderRegistry.get(providerId);
  const apiKey = cfg.apiKey || cfg.gmiApiKey;
  const baseUrl = cfg.baseUrl || cfg.gmiBaseUrl || provider.defaultBaseUrl;
  const timeoutMs = Number.isFinite(cfg.upstreamTimeoutMs) ? cfg.upstreamTimeoutMs : 120000;

  const manifest = provider.manifest;
  if (manifest?.supportsApiKey && !apiKey) {
    const err = new Error(`API key is not configured for provider '${provider.displayName || provider.id}'`);
    err.code = 'MISSING_API_KEY';
    err.status = 500;
    throw err;
  }

  const context = {
    apiKey,
    baseUrl,
    timeoutMs,
    extraHeaders: req.extraHeaders,
  };

  // 1. Providers that speak native Anthropic protocol (e.g. GMI)
  if (provider.nativeProtocol === 'anthropic' && typeof provider.forward === 'function') {
    return provider.forward(req, context, httpRes);
  }

  // 2. Protocol-driven providers (e.g. OpenAI-compatible providers like OpenRouter)
  const clientModel = req.body?.model || 'claude-opus-5';
  const canonicalReq = anthropicToCanonicalRequest(req.body, {
    requestId: req.requestId,
    clientModelAlias: clientModel,
    targetModel: clientModel,
  });

  // Streaming request
  if (req.body?.stream === true) {
    const streamIterable = await provider.stream(canonicalReq, context);
    const encoder = new TextEncoder();
    const webStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamIterable) {
            const sse = canonicalChunkToAnthropicSse(chunk, { clientModel });
            if (sse) {
              controller.enqueue(encoder.encode(sse));
              if (typeof req.onEvent === 'function') {
                req.onEvent(sse);
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return {
      status: 200,
      headers: new Headers({
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      }),
      body: webStream,
      isStreaming: true,
      contentType: 'text/event-stream',
    };
  }

  // Non-streaming request
  const canonicalRes = await provider.execute(canonicalReq, context);
  const anthropicRes = canonicalToAnthropicResponse(canonicalRes, clientModel);
  const jsonBuf = Buffer.from(JSON.stringify(anthropicRes), 'utf8');
  const webStream = new ReadableStream({
    start(controller) {
      controller.enqueue(jsonBuf);
      controller.close();
    },
  });

  return {
    status: 200,
    headers: new Headers({
      'content-type': 'application/json',
      'content-length': String(jsonBuf.length),
    }),
    body: webStream,
    isStreaming: false,
    contentType: 'application/json',
  };
}
