# Redacted Sensitive Values Design

## Context

Usher stores and uses bearer tokens, OAuth2 client secrets, OAuth2 access and refresh tokens, OAuth state, PKCE code verifiers, and generated Authorization header values. Some CLI paths already receive password prompts as Effect `Redacted` values, but most domain and application flows immediately unwrap those values into plain strings.

## Goal

Keep sensitive values as `Redacted.Redacted<string>` across the application. Plain strings are allowed only at process I/O boundaries where an external API requires them, such as encryption primitives, OAuth form encoding, HTTP request headers, and serialized encrypted storage.

## Sensitive Values

The refactor treats these values as sensitive:

- Bearer token create input values.
- OAuth2 client secret create input values.
- Secret vault plaintext inputs and decrypted outputs.
- OAuth2 access tokens and refresh tokens.
- OAuth2 state values and PKCE code verifiers.
- Constructed Authorization header values.

The refactor does not wrap non-secret identifiers or routing data such as credential IDs, labels, URLs, scopes, HTTP methods, target URLs, source IPs, user agents, ciphertext, or persisted encrypted JSON.

## Architecture

Domain credential create schemas will decode sensitive input fields into `Redacted.Redacted<string>` while leaving stored credential schemas unchanged. Stored credential config continues to contain encrypted ciphertext strings because plaintext is not persisted.

Application ports will expose sensitive values as `Redacted.Redacted<string>`:

- `SecretVault.encrypt` accepts redacted plaintext and `SecretVault.decrypt` returns redacted plaintext.
- `OAuth2Client` accepts redacted client secrets, refresh tokens, state, and code verifiers where applicable, and returns redacted token response fields.
- `HttpExecutor` should receive redacted outbound Authorization header values rather than plain strings.

Application services will preserve redaction while coordinating workflows. They will unwrap only when calling infrastructure that has no redacted-aware API available.

## Infrastructure Boundaries

The CLI keeps prompt password outputs redacted until building application commands.

The encryption adapter unwraps plaintext inside the encryption operation because Node crypto APIs require strings or bytes. The decrypt operation wraps the recovered plaintext before returning it.

The OAuth2 HTTP adapter unwraps redacted values only while constructing OAuth provider form bodies or URL parameters. Provider token responses are wrapped immediately after decoding.

The HTTP executor unwraps redacted Authorization header values only when constructing the `fetch` request. Response headers remain plain strings because they are not Usher-managed secrets.

## Testing

Tests should cover the changed type and behavior boundaries:

- Domain create input schemas produce redacted sensitive values.
- Credential creation passes redacted plaintext into the vault and stores only ciphertext.
- OAuth callback and call flows pass redacted secrets and tokens through vault and OAuth client ports.
- OAuth HTTP adapter unwraps redacted inputs into provider requests and wraps token responses.
- HTTP executor unwraps redacted Authorization values for outbound requests.

All changes must pass `pnpm typecheck`; broader verification can use `vp check` and `vp test`.
