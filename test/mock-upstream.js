// test/mock-upstream.js
// Configurable mock upstream server. Injects controllable behaviors:
//   - mode: 'json' | 'sse' | 'error' | 'tool-use' | 'hang'
//   - status: HTTP status to return in error mode
//   - inspect: a callback that receives the parsed request body
//
// Returns { url, port, server, close, receivedBodies }.

import http from 'node:http';

export function startMockUpstream({ mode = 'json', status = 200, captured = [], inspect } = {}) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = null;
      const text = Buffer.concat(chunks).toString('utf8');
      if (text) {
        try { body = JSON.parse(text); } catch { body = { _raw: text }; }
      }
      const auth = req.headers['authorization'] || null;
      const accept = req.headers['accept'] || null;
      const ct = req.headers['content-type'] || null;
      const entry = { body, headers: { authorization: auth, accept, 'content-type': ct } };
      captured.push(entry);
      if (inspect) {
        try { inspect(entry); } catch {}
      }

      if (mode === 'hang') {
        // Never respond — used to test timeout/cleanup.
        return;
      }

      if (mode === 'error') {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'upstream_test_error', message: `mock error status=${status}` },
        }));
        return;
      }

      if (mode === 'sse') {
        // Stream a few SSE events then close.
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        });
        const events = [
          { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', content: [], model: 'mock', stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
          { type: 'message_stop' },
        ];
        let i = 0;
        const tick = () => {
          if (i >= events.length) { res.end(); return; }
          const ev = events[i++];
          res.write(`event: ${ev.type}\n`);
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
          setTimeout(tick, 5);
        };
        tick();
        return;
      }

      if (mode === 'tool-use') {
        // Return a tool_use content block to verify passthrough.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'mock',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01',
              name: 'get_weather',
              input: { location: 'SF' },
            },
          ],
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
        }));
        return;
      }

      // Default 'json' mode
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'mock',
        content: [{ type: 'text', text: 'pong' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 2, output_tokens: 3 },
      }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        server,
        receivedBodies: captured,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
