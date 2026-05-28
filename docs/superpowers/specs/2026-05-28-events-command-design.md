# Events Command Design

## Context

GitHub issue #9 requests a CLI command for reading Usher's audit log with `tail`-like semantics:

- `-f` follows new entries.
- `-n <n>` prints the last `n` entries.

Usher currently records audit entries for `/call` request lifecycles in the SQLite-backed `audit_logs` table through the application `AuditLog` port. Existing credential administration CLI commands talk to the daemon through the local admin HTTP API rather than reading persistence directly.

## Goal

Add a top-level `usher events` command that reads audit events through the local admin API and prints one human-readable line per event.

Default behavior:

```sh
usher events
```

prints the last 10 events.

Tail-like options:

```sh
usher events -n 50
usher events -f
usher events -n 50 -f
```

`-f` prints the current tail first, then polls for newly appended events every second. `-n` controls the initial tail size and combines with `-f` like `tail -n 50 -f`.

## Non-Goals

- Do not read the SQLite database directly from the CLI.
- Do not add a streaming or server-sent-events API for the first version.
- Do not add JSON output unless a future issue requests script-friendly output.
- Do not expose credential secrets, authorization headers, request bodies, or response bodies.

## Architecture

Add a local admin HTTP endpoint for audit events at `GET /events`. The endpoint is protected by the existing admin access-control path and served by the daemon.

The CLI extends the existing `AdminApiClient` with event-reading operations. `usher events` loads the local CLI config, creates the local admin client, fetches events, formats them, and prints them to stdout.

Following uses polling rather than streaming. After the initial tail response, the CLI calls the same admin API every second with a cursor for the last printed event and prints any newer events.

## Data Model And Cursor

Existing call audit records are displayed as `OutboundCallCompleted` events. The event name reflects that audit records are written after the request lifecycle reaches a terminal outcome: allowed, denied, or error.

Add an explicit monotonic sequence column to `audit_logs` for reliable tail and follow behavior. The sequence avoids relying on timestamps, which can collide or move under clock changes.

The API returns each event with a stable sequence cursor:

```json
[
  {
    "sequence": 123,
    "event": "OutboundCallCompleted",
    "timestamp": "2026-05-28T12:10:03.120Z",
    "outcome": "allowed",
    "method": "GET",
    "targetUrl": "https://api.example.com/v1/users",
    "upstreamStatus": 200,
    "matchedCredentialId": "cred_0123456789abcdef",
    "sourceIp": "127.0.0.1",
    "userAgent": "curl/8.0"
  }
]
```

The initial tail query returns the last `n` rows ordered oldest-to-newest within the selected tail. Follow queries return rows with a sequence greater than the last printed sequence, also ordered oldest-to-newest.

## CLI Formatting

Output is one line per event:

```text
OutboundCallCompleted 2026-05-28T12:10:03.120Z allowed GET https://api.example.com/v1/users 200 - cred_0123456789abcdef 127.0.0.1 curl/8.0
OutboundCallCompleted 2026-05-28T12:11:44.812Z denied POST https://api.example.com/v1/admin - NoMatchingCredentialError - 127.0.0.1 curl/8.0
```

Field order:

```text
event timestamp outcome method target-url upstream-status-or-dash error-code-or-dash credential-id-or-dash source-ip user-agent
```

The status, error code, and credential fields use `-` when absent. This keeps the line shape stable across allowed, denied, and error outcomes.

If no events exist, the command prints nothing and exits successfully.

## Error Handling

If the daemon is unavailable, reuse the existing CLI behavior and print:

```text
Daemon unavailable.
```

Invalid `-n` values fail through CLI argument validation with a clear parse error. Polling errors during `-f` fail the command rather than retrying forever, matching the existing direct CLI style.

## Testing

Add tests close to the implementation:

- Persistence tests verify reading the latest `n` events and reading events after a sequence cursor.
- HTTP/API tests verify `GET /events?limit=n` and `GET /events?after=sequence`, response decoding, ordering, and admin access control.
- Admin API client tests verify event response decoding and path/query construction.
- CLI tests verify the command tree includes top-level `events`, formatter output, and tail/follow semantics at the service/client boundary.

Run `pnpm typecheck` after implementation to maintain the project's type-safety feedback loop.
