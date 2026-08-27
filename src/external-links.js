// src/external-links.js
// Strict allowlist for external links opened from the renderer. The renderer
// may only pass one of the well-known keys below — never an arbitrary URL.
// The main process resolves the key to the exact official TOOLBOXLAP URL and
// hands that to shell.openExternal().

export const EXTERNAL_LINKS = Object.freeze({
  youtube: 'https://www.youtube.com/@TOOLBOXLAP-u1c',
  website: 'https://toolboxlap.com/',
  github: 'https://github.com/toolboxlap-ve',
});

/**
 * Resolve a renderer-supplied link key to its allowlisted URL.
 * Returns the exact URL string, or null when the key is not allowlisted
 * (including when the renderer tries to pass a raw URL or anything else).
 * @param {unknown} key
 * @returns {string|null}
 */
export function resolveExternalLink(key) {
  if (typeof key !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(EXTERNAL_LINKS, key)) return null;
  return EXTERNAL_LINKS[key];
}
