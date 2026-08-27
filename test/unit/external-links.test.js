// test/unit/external-links.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExternalLink, EXTERNAL_LINKS } from '../../src/external-links.js';

test('resolveExternalLink returns the allowlisted URL for a known key', () => {
  assert.equal(resolveExternalLink('youtube'), EXTERNAL_LINKS.youtube);
  assert.equal(resolveExternalLink('website'), EXTERNAL_LINKS.website);
  assert.equal(resolveExternalLink('github'), EXTERNAL_LINKS.github);
});

test('resolveExternalLink rejects unknown keys', () => {
  assert.equal(resolveExternalLink('unknown'), null);
  assert.equal(resolveExternalLink(''), null);
  assert.equal(resolveExternalLink('YOUTUBE'), null);
});

test('resolveExternalLink rejects raw URLs (defense against renderer smuggling)', () => {
  assert.equal(resolveExternalLink('https://www.youtube.com/@TOOLBOXLAP-u1c'), null);
  assert.equal(resolveExternalLink('https://example.com'), null);
  assert.equal(resolveExternalLink('file:///c:/windows'), null);
});

test('resolveExternalLink rejects non-string inputs', () => {
  assert.equal(resolveExternalLink(null), null);
  assert.equal(resolveExternalLink(undefined), null);
  assert.equal(resolveExternalLink(123), null);
  assert.equal(resolveExternalLink({}), null);
  assert.equal(resolveExternalLink([]), null);
});

test('EXTERNAL_LINKS is frozen and only contains https:// URLs', () => {
  assert.equal(Object.isFrozen(EXTERNAL_LINKS), true);
  for (const u of Object.values(EXTERNAL_LINKS)) {
    assert.match(u, /^https:\/\//);
  }
});
