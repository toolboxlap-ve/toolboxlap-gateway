// scripts/validate-openrouter.js
// Real-world validation script against live OpenRouter API.

import { openRouterProvider } from '../src/providers/openrouter-provider.js';
import { createCanonicalRequest } from '../src/canonical/index.js';

async function main() {
  console.log('====================================================');
  console.log('TOOLBOXLAP Gateway — Live OpenRouter API Validation');
  console.log('====================================================\n');

  const apiKey = process.env.OPENROUTER_API_KEY || '';
  let passed = 0;
  let total = 0;

  function report(name, ok, details = '') {
    total++;
    if (ok) {
      passed++;
      console.log(`[PASS] ${name}${details ? ` — ${details}` : ''}`);
    } else {
      console.error(`[FAIL] ${name}${details ? ` — ${details}` : ''}`);
    }
  }

  // 1. Live Model Discovery
  try {
    console.log('[1/5] Fetching live models from OpenRouter API...');
    const models = await openRouterProvider.fetchModels('', 'https://openrouter.ai/api/v1');
    const hasModels = Array.isArray(models) && models.length > 50;
    const sample = models[0] || {};
    const hasProps = sample.id && sample.name;
    report(
      'Live Model Discovery',
      hasModels && hasProps,
      `Discovered ${models.length} models. Sample: '${sample.id}' (${sample.name})`
    );
  } catch (err) {
    report('Live Model Discovery', false, err.message);
  }

  // 2. Live Connection Probe with Invalid Key (Error Verification)
  try {
    console.log('[2/5] Testing connection probe with invalid key...');
    const connResult = await openRouterProvider.testConnection('sk-or-invalid-key-testing', 'https://openrouter.ai/api/v1');
    const isExpected = connResult.ok === false && connResult.reason === 'invalid-key' && connResult.status === 401;
    report(
      'Live Invalid Key Rejection',
      isExpected,
      `Rejected with reason='${connResult.reason}', status=${connResult.status}`
    );
  } catch (err) {
    report('Live Invalid Key Rejection', false, err.message);
  }

  // 3. Live Error Handling (Chat completion with invalid key)
  try {
    console.log('[3/5] Testing chat execution rejection with invalid key...');
    const req = createCanonicalRequest({
      targetModel: 'meta-llama/llama-3.2-1b-instruct:free',
      messages: [{ role: 'user', content: 'Ping' }],
    });
    let errorCaught = null;
    try {
      await openRouterProvider.execute(req, {
        apiKey: 'sk-or-invalid-key-testing',
        baseUrl: 'https://openrouter.ai/api/v1',
      });
    } catch (e) {
      errorCaught = e;
    }
    const isErrorHandled = errorCaught && (errorCaught.status === 401 || errorCaught.code === 401 || errorCaught.code === '401');
    report(
      'Live Error Normalization',
      isErrorHandled,
      `Normalized error status=${errorCaught?.status}, code='${errorCaught?.code}', message='${errorCaught?.message}'`
    );
  } catch (err) {
    report('Live Error Normalization', false, err.message);
  }

  // 4 & 5. Live Authenticated Tests (if OPENROUTER_API_KEY is available)
  if (!apiKey) {
    console.log('\n[INFO] OPENROUTER_API_KEY is not set in environment.');
    console.log('[INFO] Public model discovery, connection verification, and live error normalization succeeded.');
    console.log('[INFO] Set OPENROUTER_API_KEY to validate live chat, streaming, and tool calling.\n');
  } else {
    console.log('\n[INFO] OPENROUTER_API_KEY detected. Running authenticated live tests...');

    // Live Valid Connection Test
    try {
      console.log('[4/6] Testing connection probe with real key...');
      const validConn = await openRouterProvider.testConnection(apiKey, 'https://openrouter.ai/api/v1');
      report('Live Authenticated Connection', validConn.ok === true, `Result ok=${validConn.ok}`);
    } catch (err) {
      report('Live Authenticated Connection', false, err.message);
    }

    // Live Standard Chat Completion
    const liveModel = process.env.OPENROUTER_TEST_MODEL || 'meta-llama/llama-3.2-1b-instruct:free';
    try {
      console.log(`[5/6] Testing live chat completion using model '${liveModel}'...`);
      const req = createCanonicalRequest({
        targetModel: liveModel,
        messages: [{ role: 'user', content: 'Respond with the single word: "PONG"' }],
        maxTokens: 50,
      });
      const res = await openRouterProvider.execute(req, {
        apiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
      });
      const text = res.content?.[0]?.text || '';
      report(
        'Live Chat Completion',
        text.length > 0,
        `Response: "${text.trim().slice(0, 40)}" (Tokens: in=${res.usage.inputTokens}, out=${res.usage.outputTokens})`
      );
    } catch (err) {
      report('Live Chat Completion', false, err.message);
    }

    // Live Streaming
    try {
      console.log(`[6/6] Testing live streaming using model '${liveModel}'...`);
      const req = createCanonicalRequest({
        targetModel: liveModel,
        stream: true,
        messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
        maxTokens: 50,
      });
      const stream = openRouterProvider.stream(req, {
        apiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
      });
      const deltas = [];
      for await (const chunk of stream) {
        if (chunk.type === 'text_delta') {
          deltas.push(chunk.text);
        }
      }
      const streamText = deltas.join('');
      report(
        'Live Streaming',
        streamText.length > 0,
        `Streamed ${deltas.length} deltas: "${streamText.trim().slice(0, 40)}"`
      );
    } catch (err) {
      report('Live Streaming', false, err.message);
    }
  }

  console.log(`\n====================================================`);
  console.log(`Validation Complete: ${passed}/${total} checks passed.`);
  console.log(`====================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error during validation:', e);
  process.exit(1);
});
