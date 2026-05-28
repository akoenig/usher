# Usher CLI Design

## Summary

Usher will expose a single `usher` command-line interface for local administration. The CLI makes loopback-only credential administration usable without hand-crafting `curl` commands. It remains a client of the existing HTTP admin API rather than a second path into the application services.

The existing server entrypoint behavior moves behind an explicit `usher daemon` command.

## Goals

- Provide an interactive local CLI for creating, listing, fetching, and deleting credentials.
- Keep all credential administration routed through the existing loopback-only HTTP admin API.
- Make `usher daemon` responsible for starting the HTTP server.
- Avoid remote administration support in v1.
- Preserve Usher's provider/API-agnostic domain model.

## Non-Goals

- No remote admin client mode.
- No command aliases such as `cred` or `credential`.
- No daemon auto-start from admin commands.
- No direct database or application-service access from credential commands.
- No broad OAuth provider catalog.
- No credential update workflow.

## Command Surface

The top-level binary becomes an explicit command dispatcher:

```sh
usher
usher --help
usher daemon
usher credentials list
usher credentials get <credential-id>
usher credentials delete <credential-id>
usher credentials create-bearer-token
usher credentials create-oauth2
```

Running `usher` with no arguments shows help and exits successfully. It does not start the server.

`usher daemon` preserves today's server behavior: load configuration, run SQLite migrations, start the HTTP server, and keep running.

## Local Connection Model

Credential commands always target the local daemon:

```text
http://127.0.0.1:<USHER_PORT>
```

`USHER_PORT` remains the only way to change the local port because it is already daemon listen configuration. The CLI does not expose `--base-url` or `--port`. `USHER_BASE_URL` is not used for admin CLI targeting because it may represent an externally reachable OAuth callback URL.

If the local daemon is unreachable, admin commands fail with a clear message instructing the user to run:

```sh
usher daemon
```

## Interactive Credential Creation

Credential creation commands are interactive by default.

`usher credentials create-bearer-token` prompts for:

- Label
- Allowed origin
- Allowed path prefix
- Bearer token, entered as hidden input when supported

The CLI submits the collected values to `POST /credentials` using the existing bearer token credential request body.

`usher credentials create-oauth2` starts with a provider prompt:

- Google
- Custom

For both providers, the CLI prompts for:

- Label
- Allowed origin
- Allowed path prefix
- Client ID
- Client secret, entered as hidden input when supported
- Scopes

For `Google`, the CLI supplies these OAuth endpoint defaults:

```text
authorizationUrl = https://accounts.google.com/o/oauth2/v2/auth
tokenUrl = https://oauth2.googleapis.com/token
```

For `Custom`, the CLI also prompts for authorization URL and token URL.

Provider selection is only a CLI convenience. The provider name is not sent to the admin API and is not stored in the credential domain model.

## Google Scope Presets

Google OAuth2 creation offers a small multi-select preset list plus custom scopes. Initial presets are:

- Google Calendar readonly
- Google Calendar read/write
- Google Drive readonly
- Google Drive file-level access
- Gmail readonly
- Custom

The user may select multiple presets. If `Custom` is selected, the CLI asks for one or more additional scope strings. The final request sends a flat de-duplicated `scopes` array to `POST /credentials`.

If the user selects redundant combinations, such as readonly and read/write scopes for the same API, the CLI may warn but should not block submission. The OAuth provider remains the source of truth for scope validity.

## List, Get, And Delete

`usher credentials list` calls `GET /credentials` and prints a human-readable list.

`usher credentials get <credential-id>` calls `GET /credentials/{credentialId}` and prints a human-readable credential summary without exposing secrets.

`usher credentials delete <credential-id>` fetches the credential first when possible, then asks for confirmation:

```text
Delete credential "Google Calendar" (cred_...)? This cannot be undone. [y/N]
```

If fetching fails but the delete command can still proceed, the fallback confirmation uses the credential ID:

```text
Delete credential cred_...? This cannot be undone. [y/N]
```

The default answer is `No`. Confirmed deletion calls `DELETE /credentials/{credentialId}`.

## Output

The v1 CLI optimizes for human-readable local administration.

Create commands print the created credential summary. OAuth2 creation also prints the returned `loginUrl` prominently so the user can complete browser authorization.

Machine-readable JSON output can be added later, but it is not required for the first interactive CLI version.

## Architecture

The CLI is an infrastructure adapter around the existing admin HTTP API.

- CLI command parsing and prompts live outside the domain layer.
- Credential commands use HTTP requests to the local daemon.
- The daemon continues to own migrations, service composition, and HTTP routing.
- Existing application services remain the only place where credential workflows are coordinated.

This keeps the HTTP admin API as the single authoritative behavior path and avoids duplicating credential creation logic in the CLI.

## Error Handling

- If the daemon is unreachable, print a concise daemon-not-running error and suggest `usher daemon`.
- If the admin API returns a semantic error body, show the error code and message in human-readable form.
- If prompt input is structurally invalid, ask again where practical rather than submitting a request known to fail.
- If deletion is not confirmed, print that no changes were made and exit successfully.

## Testing

- Unit-test command request construction for bearer token and OAuth2 creation.
- Unit-test Google provider defaults and scope de-duplication.
- Unit-test local daemon URL resolution from `USHER_PORT`.
- Unit-test delete confirmation behavior.
- Integration-test CLI admin commands against the HTTP app with test services or a local test server where practical.
