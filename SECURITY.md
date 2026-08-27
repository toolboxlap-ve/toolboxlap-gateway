# Security Policy

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository when it becomes available. Do not open a public issue for a suspected vulnerability until maintainers have had a reasonable opportunity to investigate it.

Do not include GMI API keys, Local Gateway Tokens, `.env` contents, prompts, private model output, or user-data files in any issue, pull request, screenshot, log, or diagnostic archive.

If private vulnerability reporting is not available, use the official project website to locate the current private contact method. No security email address is declared in this repository.

## Supported security model

TOOLBOXLAP Gateway is local-first software:

- It binds to `127.0.0.1` by default.
- Normal localhost development can run without local bearer authentication.
- The documented `toolboxlap` token is a convenience value for local client configuration. It is public and must not be treated as a strong network credential.
- A non-loopback bind is refused unless a separate Local Gateway Token of at least 24 characters is configured.
- Non-loopback routes require the configured bearer token.

Direct public-Internet exposure is unsupported. The gateway can make billable upstream requests using the configured GMI credential and is not a hardened multi-user reverse proxy.

## API-key handling

The GMI API key is sent only to the configured GMI Cloud endpoint as an outbound bearer credential. Application logging and activity events are designed to omit API keys, authorization headers, prompts, and complete request bodies.

The Electron GUI uses `safeStorage` when platform encryption is available. If it is unavailable, the current implementation may store the key as plaintext in `toolbox-gmi-key.txt` inside the Electron user-data directory. This fallback is not equivalent to encryption. Protect the Windows account, filesystem, backups, and diagnostic archives.

Source-mode `.env` files and runtime credential/configuration filenames are ignored by Git. Contributors must still inspect staged files before every commit.

## Unsupported configurations

- Public-Internet exposure
- Non-loopback binding without a strong unique token
- Network exposure using the public `toolboxlap` convenience token
- Sharing one gateway among mutually untrusted users
- Committing or uploading `.env` or Electron user-data files
