// src/providers/manifests/deepseek.manifest.js
// Manifest describing DeepSeek provider.

import { createProviderManifest } from '../manifest.js';

export const deepSeekManifest = createProviderManifest({
  id: 'deepseek',
  displayName: 'DeepSeek',
  description: 'Advanced reasoning and chat models with state-of-the-art coding and math capabilities',
  website: 'https://deepseek.com',
  documentationUrl: 'https://platform.deepseek.com/api-docs',
  defaultBaseUrl: 'https://api.deepseek.com',
  protocol: 'openai-chat',
  icon: 'deepseek',
  supportsApiKey: true,
  supportsModelDiscovery: true,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: false,
  supportsThinking: true,
  supportsReasoning: true,
  capabilities: {
    streaming: true,
    tools: true,
    toolChoice: true,
    parallelToolCalls: true,
    vision: false,
    systemPrompts: true,
    thinking: true,
    reasoning: true,
    maxContextTokens: 64000,
  },
});
