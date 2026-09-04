// src/providers/manifests/openrouter.manifest.js
// Manifest describing OpenRouter provider.

import { createProviderManifest } from '../manifest.js';

export const openRouterManifest = createProviderManifest({
  id: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Unified interface for leading AI models with smart routing and competitive pricing',
  website: 'https://openrouter.ai',
  documentationUrl: 'https://openrouter.ai/docs',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  protocol: 'openai-chat',
  icon: 'openrouter',
  supportsApiKey: true,
  supportsModelDiscovery: true,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: true,
  supportsThinking: true,
  supportsReasoning: true,
  capabilities: {
    streaming: true,
    tools: true,
    toolChoice: true,
    parallelToolCalls: true,
    vision: true,
    systemPrompts: true,
    thinking: true,
    reasoning: true,
    maxContextTokens: 2000000,
  },
});
