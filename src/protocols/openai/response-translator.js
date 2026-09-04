// src/protocols/openai/response-translator.js
// Translates OpenAI /v1/chat/completions JSON response to CanonicalResponse.

import { createCanonicalResponse } from '../../canonical/response.js';

/**
 * Map OpenAI finish_reason to Canonical stopReason.
 * @param {string} [finishReason]
 * @param {boolean} [hasToolCalls]
 * @returns {'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'}
 */
export function mapFinishReason(finishReason, hasToolCalls = false) {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'stop_sequence';
    default:
      return hasToolCalls ? 'tool_use' : 'end_turn';
  }
}

/**
 * Translates OpenAI Chat Completion response to CanonicalResponse.
 * @param {Record<string, any>} openAiResponse
 * @param {string} [targetModel]
 * @returns {import('../../canonical/response.js').CanonicalResponse}
 */
export function openAiToCanonicalResponse(openAiResponse, targetModel = '') {
  if (!openAiResponse || typeof openAiResponse !== 'object') {
    throw new TypeError('openAiToCanonicalResponse requires a valid response object.');
  }

  const choice = openAiResponse.choices?.[0] || {};
  const message = choice.message || {};
  const contentParts = [];

  // Text content
  if (typeof message.content === 'string' && message.content.length > 0) {
    contentParts.push({
      type: 'text',
      text: message.content,
    });
  }

  // Tool calls
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  if (hasToolCalls) {
    for (const tc of message.tool_calls) {
      if (!tc || typeof tc !== 'object') continue;
      let inputObj = {};
      if (tc.function?.arguments) {
        try {
          inputObj = JSON.parse(tc.function.arguments);
        } catch {
          inputObj = { _raw: tc.function.arguments };
        }
      }
      contentParts.push({
        type: 'tool_use',
        id: tc.id || `toolu_${Math.random().toString(36).slice(2, 11)}`,
        name: tc.function?.name || 'unknown_tool',
        input: inputObj,
      });
    }
  }

  const stopReason = mapFinishReason(choice.finish_reason, hasToolCalls);

  const usageData = openAiResponse.usage || {};
  const inputTokens = Number.isFinite(usageData.prompt_tokens) ? usageData.prompt_tokens : 0;
  const outputTokens = Number.isFinite(usageData.completion_tokens) ? usageData.completion_tokens : 0;
  const totalTokens = Number.isFinite(usageData.total_tokens) ? usageData.total_tokens : inputTokens + outputTokens;

  return createCanonicalResponse({
    id: openAiResponse.id || undefined,
    model: openAiResponse.model || targetModel || '',
    content: contentParts,
    stopReason,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
    rawResponse: openAiResponse,
  });
}
