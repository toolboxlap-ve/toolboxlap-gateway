# Security Policy

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository when available.
Do not open a public issue for a suspected vulnerability until maintainers have
had a reasonable opportunity to investigate it.

Do not include provider API keys, Local Gateway Tokens, `.env` contents,
prompts, private model output, absolute personal paths, logs, or user-data files
in an issue, pull request, screenshot, or diagnostic archive.

If private vulnerability reporting is unavailable, use the official project
website to locate the current private contact method. No security email address
is declared in this repository.

## Supported security model

TOOLBOXLAP Gateway is local-first software:

- It binds to `127.0.0.1` by default.
- Normal loopback use can run without local bearer authentication.
- The documented `toolboxlap` token is a convenience value for local client
  configuration. It is public and is not a strong network credential.
- A non-loopback bind is refused unless a separate Local Gateway Token of at
  least 24 characters is configured.
- Non-loopback routes require the configured bearer token.

Direct public-Internet exposure is unsupported. The gateway can make billable
requests using credentials for the selected upstream provider and is not a
hardened multi-user reverse proxy.

## Provider API-key handling

The current application supports GMI Cloud, OpenRouter, and DeepSeek. A saved
API key is associated with its provider and sent only to the selected
provider's configured endpoint as an outbound credential.

The Electron GUI uses `safeStorage` when platform encryption is available. If
encryption is unavailable, the implementation may store a provider key as
plaintext in `toolbox-key-{provider}.txt` inside Electron's user-data
directory. This fallback is not equivalent to encryption. Legacy GMI key
filenames remain readable for backward compatibility.

Application logging and activity events are designed to omit API keys,
authorization headers, prompts, and complete request bodies. Source-mode
`.env` files, provider credential files, configuration, logs, caches, and
runtime user-data are ignored by Git. Contributors must still inspect staged
files before every commit.

## Unsupported configurations

- Public-Internet exposure
- Non-loopback binding without a strong unique token
- Network exposure using the public `toolboxlap` convenience token
- Sharing one gateway among mutually untrusted users
- Committing or uploading `.env`, credentials, logs, or Electron user-data
- Assuming all provider models offer identical security or feature behavior
