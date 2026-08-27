# Contributing

Thank you for helping improve TOOLBOXLAP Gateway — GMI Edition.

1. Fork the future public repository and create a focused branch.
2. Install Node.js 22.12.0 or newer.
3. Install exact dependencies with `npm ci`.
4. Make a small, reviewable change that preserves the local-first security model.
5. Run `npm run check` and `npm test`.
6. Update tests and documentation when behavior changes.
7. Open a pull request describing the problem, solution, and verification performed.

Do not commit API keys, tokens, `.env` files, local paths, user-data files, logs, build output, or generated executables. Use only clearly fake credentials in tests.

Keep the default bind on `127.0.0.1`. Changes affecting authentication, credential storage, request logging, Electron IPC, or external URLs require explicit security-focused tests.

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), not through public issues.
