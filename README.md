# TOOLBOXLAP Gateway — GMI Edition

**Version 0.2.9 · Windows · Local Anthropic-compatible gateway**

TOOLBOXLAP Gateway connects Claude Desktop or Claude Code to models served by GMI Cloud. It presents a local Anthropic-compatible endpoint, maps a Claude-visible alias to the GMI model you select, and forwards requests without changing prompts or tool payloads.

```text
Claude Desktop / Claude Code
             ↓
     TOOLBOXLAP Gateway
             ↓
          GMI Cloud
             ↓
Selected AI model (tested with MiniMax M3)
```

The Claude-style model name is a compatibility alias. Responses come from the selected GMI model, not from Anthropic.

## Key features

- Local gateway at `http://127.0.0.1:8787` by default
- GMI Edition locked to `https://api.gmi-serving.com`
- Fetches available models from GMI Cloud
- Maps `claude-opus-5` to a selected model such as `MiniMaxAI/MiniMax-M3`
- Supports streaming responses and Anthropic-style message requests
- Passes tool definitions and `tool_use` responses through when supported by the selected provider/model
- Stores configuration locally and keeps the GMI API key out of renderer code
- Sanitized activity view without prompts, request bodies, authorization headers, or API keys
- Fail-closed protection for non-loopback binding

Provider availability, pricing, trial credits, rate limits, and model availability are controlled by GMI Cloud and may change. This project does not promise unlimited usage or permanently free access.

## Requirements

- Windows 10 or Windows 11, x64
- Claude Desktop or a compatible Claude Code configuration
- A GMI Cloud account and API key
- Internet access to GMI Cloud

For source builds, see [Building from source](docs/BUILDING.md).

## Installation

### Official portable Windows build

Download `TOOLBOXLAP-Gateway-GMI-0.2.8.exe` from the [official download host](https://downloads.toolboxlap.com/).

The source tree is prepared for v0.2.9. Until that release is published, the
officially published executable remains the historical v0.2.8 artifact below.

Published SHA-256:

```text
BF5F5A1EA740FE9575789E9E845A07C8035983E4E073313E0C38CECE0E2643EF
```

Verify it in PowerShell:

```powershell
Get-FileHash .\TOOLBOXLAP-Gateway-GMI-0.2.8.exe -Algorithm SHA256
```

The published executable is not Authenticode-signed. Windows SmartScreen may show a warning on first launch. Verify the filename, download source, and SHA-256 before running it.

### Source checkout

```powershell
npm ci
npm run check
npm test
npm run start:gui
```

Node.js 22.12.0 or newer is required by the current Electron toolchain.

## Quick start

1. Launch the portable executable or run `npm run start:gui` from source.
2. Paste your GMI API key into **GMI Connection**, then select **Save**.
3. Select **Test** to verify the credential.
4. Select **Fetch Models**.
5. Choose a model, or enter a custom GMI model ID. The tested example is `MiniMaxAI/MiniMax-M3`.
6. Select **Start Gateway**.
7. Configure Claude with the local base URL, token, and alias shown by the app.

Full installation guide: <https://toolboxlap.com/minimax-m3-claude-desktop-toolboxlap-gateway/>

Video tutorial: <https://youtu.be/pXhldSkI30g>

## GMI API key

Create an API key in your GMI Cloud account and enter it only in the **GMI Connection** field. The GMI API key authenticates outbound requests from the gateway to GMI Cloud. It is different from the Local Gateway Token used by Claude to authenticate to the gateway.

When Electron `safeStorage` encryption is available, the GUI stores the GMI key in encrypted form in the application user-data directory. If encryption is unavailable, the current implementation can fall back to a plaintext file named `toolbox-gmi-key.txt` in that same user-data directory. Protect the Windows account and filesystem accordingly. Credential values are excluded from logs and must never be committed.

The source/CLI workflow can instead read `GMI_API_KEY` from a local `.env` file. `.env` and its backups are ignored by Git; only the blank `.env.example` template belongs in source control.

## Claude Desktop configuration

In Claude Desktop, open the third-party inference configuration and use:

| Setting | Value |
|---|---|
| Connection | Gateway |
| Credential kind | Static API key |
| Gateway base URL | `http://127.0.0.1:8787` |
| Gateway API key | Local Gateway Token shown by TOOLBOXLAP Gateway |
| Authentication scheme | Bearer |
| Model discovery | Enabled |

After applying the settings, Claude should discover the configured alias—`claude-opus-5` by default.

### Alias and model mapping

```text
Claude-visible alias: claude-opus-5
GMI model ID:         MiniMaxAI/MiniMax-M3
```

Claude sends the alias. TOOLBOXLAP Gateway replaces it with the selected GMI model ID before forwarding the request.

## Local Gateway Token

The Local Gateway Token protects requests from Claude to the gateway; it is not the GMI API key.

`toolboxlap` is the documented convenience token created for the local workflow. Because it is public and predictable, it must not be treated as strong protection for LAN or Internet exposure.

The normal configuration stays bound to `127.0.0.1`. If an advanced user explicitly chooses a non-loopback host, startup fails unless a separate token of at least 24 characters is configured. Use **Regen** to create a strong random token. Non-loopback routes require that bearer token.

Never expose the gateway directly to the public Internet. It can make billable upstream requests using your GMI credential.

## MCP and tool compatibility

The gateway preserves Anthropic-style message content, tool definitions, tool-choice data, and tool-use response blocks. Actual MCP or tool behavior depends on Claude, GMI Cloud, and the capabilities of the selected model. Compatibility is not guaranteed for every provider model or future API change.

## Security notes

- Default bind: `127.0.0.1`
- Default port: `8787`
- GMI provider URL is locked in the GUI edition
- API keys, authorization headers, prompts, and full request bodies are not written to the activity log
- Renderer isolation is enabled and Node integration is disabled
- External links use a fixed allowlist
- Non-loopback startup requires an explicit strong token and otherwise fails closed
- Treat `.env`, user-data credential files, logs, and diagnostic bundles as sensitive

See [SECURITY.md](SECURITY.md) for vulnerability reporting and the supported security model.

## Troubleshooting

### Invalid API key

Create or verify the key in GMI Cloud, save it again, and select **Test**.

### No models found

Verify the connection first, then retry **Fetch Models**. Availability depends on GMI Cloud.

### Port already in use

Choose another local port, save the configuration, restart the gateway, and update Claude's base URL.

### Model discovery fails

Confirm that the gateway is running, Claude is using the displayed Local Gateway Token, and the configured alias matches the alias shown by the gateway.

### Non-loopback bind is refused

Return the host to `127.0.0.1`, or explicitly enable authentication and generate a strong Local Gateway Token. The public `toolboxlap` convenience value is intentionally rejected for non-loopback binds.

## Project links

- Website: <https://toolboxlap.com/>
- Written installation guide: <https://toolboxlap.com/minimax-m3-claude-desktop-toolboxlap-gateway/>
- YouTube tutorial: <https://youtu.be/pXhldSkI30g>
- Official downloads: <https://downloads.toolboxlap.com/>
- Build instructions: [docs/BUILDING.md](docs/BUILDING.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- v0.2.9 release notes: [docs/releases/v0.2.9.md](docs/releases/v0.2.9.md)
- v0.2.8 release notes: [docs/releases/v0.2.8.md](docs/releases/v0.2.8.md)

## License

Copyright © 2026 TOOLBOXLAP.

Licensed under the [GNU General Public License v3.0](LICENSE).
