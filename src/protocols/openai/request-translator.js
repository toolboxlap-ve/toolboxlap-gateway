// src/protocols/openai/request-translator.js
// Translates CanonicalRequest to OpenAI /v1/chat/completions request body.

/**
 * Translates CanonicalRequest into OpenAI /v1/chat/completions payload.
 * @param {import('../../canonical/request.js').CanonicalRequest} request
 * @returns {Record<string, any>}
 */
export function canonicalToOpenAiRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new TypeError('canonicalToOpenAiRequest requires a valid request object.');
  }

  const outMessages = [];

  // 1. System Prompt
  if (request.systemPrompt && typeof request.systemPrompt === 'string') {
    outMessages.push({
      role: 'system',
      content: request.systemPrompt,
    });
  }

  // 2. Messages translation
  const rawMessages = Array.isArray(request.messages) ? request.messages : [];

  for (const msg of rawMessages) {
    if (!msg || typeof msg !== 'object') continue;

    const role = msg.role || 'user';
    const content = msg.content;

    // String content
    if (typeof content === 'string') {
      outMessages.push({ role, content });
      continue;
    }

    // Array of content parts
    if (Array.isArray(content)) {
      const textParts = [];
      const imageParts = [];
      const toolUseParts = [];
      const toolResultParts = [];

      for (const part of content) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text' && typeof part.text === 'string') {
          textParts.push(part.text);
        } else if (part.type === 'image' && part.base64Data) {
          const mime = part.mimeType || 'image/png';
          imageParts.push({
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${part.base64Data}` },
          });
        } else if (part.type === 'tool_use' && part.name) {
          toolUseParts.push({
            id: part.id || `call_${Math.random().toString(36).slice(2, 11)}`,
            type: 'function',
            function: {
              name: part.name,
              arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input || {}),
            },
          });
        } else if (part.type === 'tool_result' && part.toolUseId) {
          toolResultParts.push({
            role: 'tool',
            tool_call_id: part.toolUseId,
            content: typeof part.content === 'string' ? part.content : JSON.stringify(part.content ?? ''),
          });
        }
      }

      // Handle assistant messages with tool calls
      if (role === 'assistant') {
        const assistantMsg = { role: 'assistant' };
        assistantMsg.content = textParts.length > 0 ? textParts.join('\n') : null;
        if (toolUseParts.length > 0) {
          assistantMsg.tool_calls = toolUseParts;
        }
        outMessages.push(assistantMsg);
        continue;
      }

      // Handle tool results: each becomes an independent role: 'tool' message in OpenAI
      if (toolResultParts.length > 0) {
        for (const tr of toolResultParts) {
          outMessages.push(tr);
        }
        // If there were also text parts in the same turn, push them as a user message
        if (textParts.length > 0 || imageParts.length > 0) {
          if (imageParts.length === 0) {
            outMessages.push({ role, content: textParts.join('\n') });
          } else {
            outMessages.push({
              role,
              content: [
                ...textParts.map((t) => ({ type: 'text', text: t })),
                ...imageParts,
              ],
            });
          }
        }
        continue;
      }

      // Standard user/system message with text or multimodal content
      if (imageParts.length === 0) {
        outMessages.push({ role, content: textParts.join('\n') });
      } else {
        outMessages.push({
          role,
          content: [
            ...textParts.map((t) => ({ type: 'text', text: t })),
            ...imageParts,
          ],
        });
      }
      continue;
    }

    // Fallback for primitive or object content
    outMessages.push({ role, content: String(content ?? '') });
  }

  const payload = {
    model: request.targetModel || 'gpt-4o',
    messages: outMessages,
  };

  // 3. Tools translation
  if (Array.isArray(request.tools) && request.tools.length > 0) {
    payload.tools = request.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));

    // 4. Tool choice translation
    if (request.toolChoice) {
      if (request.toolChoice === 'auto' || request.toolChoice === 'none') {
        payload.tool_choice = request.toolChoice;
      } else if (request.toolChoice === 'any') {
        payload.tool_choice = 'required';
      } else if (typeof request.toolChoice === 'object' && request.toolChoice.type === 'tool' && request.toolChoice.name) {
        payload.tool_choice = {
          type: 'function',
          function: { name: request.toolChoice.name },
        };
      }
    }
  }

  // 5. Parameters
  if (request.stream === true) {
    payload.stream = true;
  }
  if (Number.isFinite(request.maxTokens)) {
    payload.max_tokens = request.maxTokens;
  }
  if (Number.isFinite(request.temperature)) {
    payload.temperature = request.temperature;
  }
  if (Number.isFinite(request.topP)) {
    payload.top_p = request.topP;
  }

  // 6. Merge extra params without overriding core fields
  if (request.extraParams && typeof request.extraParams === 'object') {
    for (const [k, v] of Object.entries(request.extraParams)) {
      if (!(k in payload)) {
        payload[k] = v;
      }
    }
  }

  return payload;
}
