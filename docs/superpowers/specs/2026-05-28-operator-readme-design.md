# Operator README Design

## Summary

Rewrite the root `README.md` for operators who want to run `usher`, configure it safely, create credentials, and send authenticated API calls through `/call`.

The README should be practical and copy-paste friendly. It should explain enough of the security model for safe operation without becoming an internal architecture document.

## Audience

Primary audience: end users and operators.

Secondary audience: developers running the service locally to evaluate it.

Contributor and architecture details should stay brief and appear near the end.

## Structure

The README will use this flow:

1. Project overview: what `usher` does and why agents use it.
2. Current status: self-hosted, headless, single-user v1.
3. Quick start: install, create data directory, generate encryption key, set environment variables, run server.
4. Configuration reference for required `USHER_*` environment variables.
5. Security model: loopback admin endpoints, `/call` allowlist, key-file permissions, encrypted stored secrets, no token exposure.
6. Bearer token credential walkthrough.
7. OAuth2 credential walkthrough.
8. Calling upstream APIs through `/call`.
9. Endpoint summary.
10. Error response format and troubleshooting.
11. Development commands.

## Usage Examples

Examples should favor direct `curl` commands and shell snippets. Bearer token setup comes before OAuth2 because it is the smallest successful path.

The encryption key setup must generate a 32-byte base64url value prefixed with `base64url:` and set file permissions to `0600` or `0400`.

OAuth2 documentation should show credential creation, explain the returned `loginUrl`, and make clear that the operator completes authorization in a browser before `/call` can use that credential.

## Non-Goals

- No full OpenAPI-style reference.
- No contributor guide beyond basic development commands.
- No deployment guide for Docker, systemd, reverse proxies, or hosted infrastructure.
- No provider-specific OAuth instructions beyond generic field examples.

## Validation

Review the README for command accuracy against `package.json`, runtime config in `src/Infrastructure/Config/UsherConfig.ts`, and endpoint routes in `src/Infrastructure/Http/HttpServer.ts`.

Run at least `pnpm typecheck` after editing to catch accidental TypeScript regressions if any source files are touched. For README-only edits, no code test is required, but verify the diff contains only documentation unless intentionally changed.
