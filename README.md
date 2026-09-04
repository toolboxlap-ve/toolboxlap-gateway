# TOOLBOXLAP Gateway v1.0 Beta

**Multi-Provider AI Gateway for Claude Desktop and Claude Code workflows.**

TOOLBOXLAP Gateway is a local Windows application that exposes an
Anthropic-compatible endpoint and routes requests to a selected upstream AI
provider and model. Version 1.0 Beta expands the original GMI-focused gateway
into a multi-provider architecture while preserving the existing GMI workflow.

> **Beta:** This release is under active development. Provider APIs and model
> behavior can change, and compatibility varies by provider and model.

## Supported providers

The current build implements:

- **GMI Cloud** — native Anthropic-style upstream adapter.
- **OpenRouter** — OpenAI-compatible chat-completions adapter.
- **DeepSeek** — OpenAI-compatible chat-completions adapter.

LM Studio and Ollama are planned for future releases; they are not implemented
in v1.0 Beta.

## How it works

```text
Claude Desktop / Claude Code
              |
              v
 http://127.0.0.1:8787
              |
              v
     TOOLBOXLAP Gateway
              |
              v
 GMI Cloud / OpenRouter / DeepSeek
```

Claude connects to the local gateway using the configured Claude-visible model
alias. The gateway resolves that alias to the active provider and model, then
translates requests and responses when the upstream uses the OpenAI chat
protocol.

The implementation includes a provider abstraction, dynamic provider registry,
provider manifests, an OpenAI-compatible provider base, a canonical
request/response/event layer, Anthropic/OpenAI protocol translation, and
runtime provider/model switching.

## Download

Download the Windows x64 portable build:

[TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe](https://downloads.toolboxlap.com/gateway/gateway/v1.0-beta/TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe)

The portable build requires no installer. Windows SmartScreen may warn because
the executable is not represented here as Authenticode-signed. Verify that the
filename and download source match the link above.

## Requirements

- Windows 10 or Windows 11, x64
- Claude Desktop or a compatible Claude Code workflow
- An API key for the selected provider
- Internet access to that provider

For source builds, use Node.js 22.12.0 or newer and see
[Building from source](docs/BUILDING.md).

## Quick start

1. Launch `TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe`, or run
   `npm run start:gui` from a source checkout.
2. Select **GMI Cloud**, **OpenRouter**, or **DeepSeek**.
3. Enter the API key for that provider and select **Save**.
4. Select **Test Connection**.
5. Select **Fetch Models**.
6. Search for and select a model.
7. Start the gateway and configure Claude to use its local endpoint.
8. Use Claude Desktop or Claude Code through the local gateway.
9. Where supported by the current provider/model, change the active provider or
   model in TOOLBOXLAP Gateway without restarting the running gateway session.

Provider settings, cached model lists, selected models, and favorites are kept
separately for each provider.

## Claude connection

The default local endpoint is:

```text
http://127.0.0.1:8787
```

Use the Claude-visible alias shown in the application (the default is
`claude-opus-5`).

The Local Gateway Token is separate from every provider API key. Localhost mode
can run without local bearer authentication. If local gateway authentication is
enabled, copy the token shown by TOOLBOXLAP Gateway into Claude's gateway
credential field and use bearer authentication.

Do not expose the gateway directly to the public Internet. A non-loopback bind
is refused unless an explicitly configured Local Gateway Token contains at
least 24 characters. The public convenience value is rejected outside
loopback. Use a strong, unique token for any deliberately network-visible
configuration.

## Model and feature compatibility

Model discovery, streaming, tools, tool choice, vision, reasoning, context
limits, and Claude Code behavior depend on the selected provider and model.
Provider-level capability metadata does not guarantee that every model supports
every feature. Check the provider's documentation and test the intended model
before relying on it.

## Security and privacy

- Provider API keys are stored in the Electron user-data directory. Electron
  `safeStorage` encryption is used when available; otherwise the application
  may fall back to a provider-specific plaintext key file.
- Provider credentials are sent only to the selected upstream provider.
- API keys, authorization headers, prompts, and full request bodies are omitted
  from application activity events and logs by design.
- The renderer uses context isolation with Node integration disabled.
- External links are resolved through a fixed allowlist.
- `.env`, runtime credentials, user-data directories, logs, caches, build
  output, archives, and executables are excluded from source control.

See [SECURITY.md](SECURITY.md) for the full supported security model.

## Source-mode compatibility

`npm start`, `start-gateway.cmd`, and `.env.example` retain the original
GMI-oriented CLI configuration for backward compatibility. Use
`npm run start:gui` or the portable application for the multi-provider
management interface.

## Previous GMI Edition

The original GMI-focused line remains part of the project history:

- **v0.2.9** — previous GMI-focused source release:
  [release notes](docs/releases/v0.2.9.md)
- **v0.2.8** — previous published GMI artifact:
  [release notes and checksum](docs/releases/v0.2.8.md)

Those historical records are preserved and do not describe the v1.0 Beta
multi-provider build.

## Project links

- Website: <https://toolboxlap.com/>
- GitHub: <https://github.com/toolboxlap-ve/toolboxlap-gateway>
- YouTube: <https://www.youtube.com/@TOOLBOXLAP-u1c>
- Build instructions: [docs/BUILDING.md](docs/BUILDING.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Release summary: [RELEASE.md](RELEASE.md)

## License

Copyright © 2026 TOOLBOXLAP.

Licensed under the [GNU General Public License v3.0](LICENSE)
(`GPL-3.0-only`).
