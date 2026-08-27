// test/unit/gmi-provider.test.js
// Tests for the GMI provider's fetchModels and testConnection functions.
// Uses a local mock HTTP server (no real GMI Cloud traffic) so these tests
// run in CI without consuming any real credits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { fetchModels, testConnection } from '../../src/providers/gmi-provider.js';

function startMock(status, body) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
        });
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}

test('fetchModels returns mapped id/name list on 200', async () => {
    const mock = await startMock(200, {
        data: [
            { id: 'MiniMaxAI/MiniMax-M3', name: 'M3' },
            { id: 'other-model', name: 'Other' },
        ],
    });
    try {
        const models = await fetchModels('test-key', mock.url);
        assert.equal(Array.isArray(models), true);
        assert.equal(models.length, 2);
        assert.equal(models[0].id, 'MiniMaxAI/MiniMax-M3');
        assert.equal(models[1].id, 'other-model');
    } finally {
        await mock.close();
    }
});

test('fetchModels throws on 401', async () => {
    const mock = await startMock(401, { error: 'unauthorized' });
    try {
        await assert.rejects(async () => fetchModels('bad-key', mock.url));
    } finally {
        await mock.close();
    }
});

test('testConnection returns ok=true on 200', async () => {
    const mock = await startMock(200, { data: [] });
    try {
        const r = await testConnection('good-key', mock.url);
        assert.equal(r.ok, true);
    } finally {
        await mock.close();
    }
});

test('testConnection returns invalid-key on 401', async () => {
    const mock = await startMock(401, { error: 'unauthorized' });
    try {
        const r = await testConnection('bad-key', mock.url);
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'invalid-key');
        assert.equal(r.status, 401);
    } finally {
        await mock.close();
    }
});

test('testConnection returns network-error when server is unreachable', async () => {
    // Pick a port we know is unbound.
    const r = await testConnection('any-key', 'http://127.0.0.1:1');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'network-error');
});
