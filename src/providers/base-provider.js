// src/providers/base-provider.js
export class BaseProvider {
  /**
   * Fetch available models from the provider.
   * @param {string} apiKey
   * @param {string} baseUrl
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async fetchModels(apiKey, baseUrl) {
    throw new Error('Not implemented');
  }
}
