// src/providers/manifests/gmi.manifest.js
// Manifest describing GMI Cloud provider.

import { createProviderManifest } from '../manifest.js';

export const gmiManifest = createProviderManifest({
  id: 'gmi',
  displayName: 'GMI Cloud',
  description: 'GMI Cloud inference platform for MiniMax and open models',
  website: 'https://gmi-serving.com',
  documentationUrl: 'https://docs.gmi-serving.com',
  defaultBaseUrl: 'https://api.gmi-serving.com',
  protocol: 'anthropic',
  icon: 'gmi',
  supportsApiKey: true,
  supportsModelDiscovery: true,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: false,
  supportsThinking: false,
  supportsReasoning: false,
  capabilities: {
    streaming: true,
    tools: true,
    toolChoice: true,
    parallelToolCalls: false,
    vision: false,
    systemPrompts: true,
    thinking: false,
    maxContextTokens: 128000,
  },
});
