// src/providers/gmi-provider.js
import { BaseProvider } from './base-provider.js';

class GmiProvider extends BaseProvider {
  async fetchModels(apiKey, baseUrl) {
    const url = new URL('/v1/models', baseUrl).toString();
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      // 401 / 403 = bad key, anything else = upstream error
      const err = new Error(`Failed to fetch GMI models: ${res.status} ${res.statusText}`);
      err.status = res.status;
      throw err;
    }

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) {
      throw new Error('Invalid response format from GMI');
    }

    return json.data.map(m => ({
      id: m.id,
      name: m.id // Display name can just be the id for now
    }));
  }

  async testConnection(apiKey, baseUrl) {
    // A lightweight "is the key valid?" probe. /v1/models requires auth and
    // is cheap; we just need any 2xx vs 4xx vs network error.
    try {
      const url = new URL('/v1/models', baseUrl).toString();
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.status === 200) return { ok: true };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: 'invalid-key', status: res.status };
      }
      return { ok: false, reason: 'upstream-error', status: res.status };
    } catch (e) {
      return { ok: false, reason: 'network-error', error: e && e.message || String(e) };
    }
  }
}

const gmi = new GmiProvider();

export async function fetchModels(apiKey, baseUrl) {
  return gmi.fetchModels(apiKey, baseUrl);
}

export async function testConnection(apiKey, baseUrl) {
  return gmi.testConnection(apiKey, baseUrl);
}
