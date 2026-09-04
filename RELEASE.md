# TOOLBOXLAP Gateway v1.0 Beta

## Release details

- **Release name:** TOOLBOXLAP Gateway v1.0 Beta
- **Package version:** `1.0.0-beta`
- **Status:** Beta — active development
- **Target:** Windows 10 / Windows 11, x64
- **License:** GPL-3.0-only

## Portable artifact

- **Filename:** `TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe`
- **Download:** <https://downloads.toolboxlap.com/gateway/gateway/v1.0-beta/TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe>

No checksum is recorded here. A checksum should be published only after the
final release artifact has been selected and verified.

## Highlights

- Multi-provider desktop gateway with GMI Cloud, OpenRouter, and DeepSeek.
- Provider abstraction with a dynamic registry and provider manifests.
- OpenAI-compatible provider base for OpenRouter and DeepSeek.
- Canonical request, response, and streaming-event model.
- Anthropic/OpenAI request, response, tool-call, and streaming translation.
- Runtime provider and model switching with separate provider settings.
- Searchable model discovery, cached model lists, and favorites.
- Sanitized request activity and gateway statistics.
- Expanded automated coverage across providers, protocols, routing, UI state,
  branding, and integration behavior.

Feature compatibility varies by provider and model. In particular, tools,
vision, reasoning, streaming, context limits, and Claude Code behavior are not
guaranteed uniformly across all available models.

LM Studio and Ollama are planned future providers and are not included in this
release.

## Compatibility and history

The GMI Cloud workflow remains supported. Version v0.2.9 is the previous
GMI-focused release, while v1.0 Beta is the current multi-provider Beta. The
historical v0.2.9 notes and tag remain unchanged.

## Verification baseline

The Phase 2 source tree is expected to pass:

- `npm run check`
- `npm test` (126 unit tests and 18 integration tests; 144 total)

Live provider checks are intentionally excluded from the automated local test
baseline because they can use real credentials and billable upstream services.
