# Changelog

All notable changes to Usher are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Usher adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- OAuth2 access tokens are now cached in memory per credential until shortly
  before they expire (using the token endpoint's `expires_in`), instead of
  performing a full refresh-token grant on every `/call`. Concurrent calls for
  the same credential are serialized through a per-credential lock, preventing
  refresh-token rotation races.
- `/call` automatically refreshes and retries once when an upstream returns
  `401 Unauthorized` for a request that used a cached OAuth2 access token.
- `GET /health` returns `{"status":"ok"}` and is reachable without the loopback
  restriction, for liveness checks and process supervisors.
- `usher credentials update <id>` edits a credential's label and allowed request
  matcher without deleting and recreating it.
- `usher credentials rotate-token <id>` replaces a bearer token credential's
  secret in place.
- `usher credentials authorize <id>` prints the login URL to re-authorize an
  existing OAuth2 credential (for example after a refresh token is revoked).
- `usher events` accepts `--credential <id>` and `--outcome <allowed|denied|error>`
  filters, served by new `credentialId` and `outcome` query parameters on
  `GET /events`.
- Audit log retention: set `auditRetentionDays` (or `USHER_AUDIT_RETENTION_DAYS`)
  to have the daemon prune audit events older than the configured window once an
  hour. Pruning is disabled when the value is unset. A new index on
  `audit_logs(created_at)` supports the prune query.
- New optional configuration fields and environment overrides:
  `upstreamTimeoutMillis` (`USHER_UPSTREAM_TIMEOUT_MILLIS`, default 30000),
  `maxBodyBytes` (`USHER_MAX_BODY_BYTES`, default 104857600), and
  `auditRetentionDays` (`USHER_AUDIT_RETENTION_DAYS`).

### Changed

- PKCE now uses the `S256` challenge method (SHA-256 of the code verifier)
  instead of `plain`.
- Upstream requests through `/call` now enforce a configurable timeout, do not
  follow redirects (3xx responses are returned to the caller as-is), and reject
  request and response bodies larger than `maxBodyBytes` (HTTP 413 for inbound
  requests).
- Upstream responses no longer forward a stale `Content-Encoding`/`Content-Length`
  after the runtime transparently decompresses the body, and multiple
  `Set-Cookie` headers are preserved individually instead of being collapsed.
- Forwarded requests now strip the caller's `Host`, `Content-Length`,
  `Accept-Encoding`, and `Expect` headers in addition to hop-by-hop headers.
- `/call` rejects target URLs whose path contains percent-encoded traversal
  segments (for example `/v1/%2e%2e/admin`).
- Upstream and OAuth token-exchange failures now carry a sanitized cause message
  for easier debugging, instead of a generic error.
- The installed systemd user unit adds `NoNewPrivileges`, `PrivateTmp`,
  `ProtectSystem=full`, and `RestrictAddressFamilies` hardening directives.
- OAuth2 credentials can be re-authorized while already `active`; completing the
  login flow again rotates the stored refresh token and granted scopes.

### Notes

- SQLite already runs in WAL mode with a 5-second busy timeout by default via the
  underlying driver; no configuration change is required.
- All changes are backwards compatible: existing config files, databases, and API
  callers continue to work unchanged. New config fields and CLI commands are
  additive.
