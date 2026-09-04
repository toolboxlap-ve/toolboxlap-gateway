# Contributing

Thank you for helping improve TOOLBOXLAP Gateway.

1. Fork the repository and create a focused branch.
2. Install Node.js 22.12.0 or newer.
3. Install exact dependencies with `npm ci`.
4. Make a small, reviewable change that preserves the local-first security
   model and backward compatibility.
5. Run `npm run check` and `npm test`.
6. Update tests and documentation when behavior changes.
7. Open a pull request describing the problem, solution, and verification.

Do not commit API keys, tokens, `.env` files, personal paths, user-data files,
logs, caches, build output, archives, or generated executables. Use only
clearly fake credentials in tests.

Keep the default bind on `127.0.0.1`. Changes affecting authentication,
credential storage, provider routing, protocol translation, request logging,
Electron IPC, or external URLs require focused tests.

The currently implemented providers are GMI Cloud, OpenRouter, and DeepSeek.
Do not document planned providers as available until implementation and tests
exist. Model capabilities vary by provider and model.

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), not
through public issues.
