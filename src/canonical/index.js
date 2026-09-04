// src/canonical/index.js
// Canonical data structures and factories for TOOLBOXLAP Gateway.

export { createCanonicalRequest } from './request.js';
export { createCanonicalResponse } from './response.js';
export {
  STREAM_EVENT_TYPES,
  createCanonicalStreamChunk,
  CanonicalStream,
} from './events.js';
