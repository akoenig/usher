# Premium README Revamp Design

## Goal

Rewrite the root `README.md` so it feels like a premium product landing page and a practical first-run guide. The README should first explain why `usher` exists, then guide users through installation, configuration, credential connection, and authenticated remote API calls.

## Audience

The primary audience is an operator, developer, or agent builder who wants a local credential gateway that keeps OAuth refresh tokens and bearer tokens out of agent runtimes, prompts, scripts, and logs.

The secondary audience is a contributor evaluating the source checkout. Source-development instructions should remain present, but they should not be the primary path.

## Positioning

`usher` should be presented as a local credential gateway for agents and automations. It stores credentials locally, applies strict caller controls, resolves credentials by target URL, and proxies approved HTTP requests through `/call` with the correct authorization applied.

The copy should be polished, concise, and confident. It should read like a premium product overview while staying technically exact and copy-paste friendly.

## Distribution And Install Path

The primary install path is the published npm-compatible package:

```sh
pnpm add --global @akoenig/usher
```

The package exposes the `usher` binary via `bin.usher = dist/Main.mjs`. The README may mention npm-compatible package managers generally, but examples should use `pnpm` to match project conventions.

Source checkout instructions belong near the end and should include `vp install`, `vp run dev daemon`, `vp run build`, and `node dist/Main.mjs daemon start`.

## Daemon Flow

The README should document the current daemon commands from `origin/main`:

- `usher daemon start` starts the daemon in the foreground.
- `usher daemon` remains valid as the same startup flow.
- `usher daemon install` installs and starts the daemon as a user-level systemd service.

The systemd install path should be presented as optional durable setup for Linux user services, not as a prerequisite for first use.

## Configuration

The README should show the required environment variables:

```sh
export USHER_DATABASE_PATH=.usher/usher.sqlite
export USHER_ENCRYPTION_KEY_FILE=.usher/encryption.key
export USHER_BASE_URL=http://localhost:3000
export USHER_ALLOWED_CALLER_IPS=127.0.0.1,::1
```

It should note that `USHER_PORT` is optional and defaults to `3000`.

The encryption key setup must generate exactly one `base64url:`-prefixed 32-byte key line and set permissions to `0600` or `0400`. The README should clearly state that replacing the key makes existing encrypted credential material unreadable.

## Credential Configuration Via CLI

The README should include a dedicated section that shows users how to configure credentials through the `usher` CLI rather than hand-written HTTP requests. This section should make it clear that credential administration talks to the local daemon, so the daemon must be running before these commands are used.

The section should show the common CLI workflow:

```sh
usher credentials create-bearer-token
usher credentials create-oauth2
usher credentials list
usher credentials get cred_0123456789abcdef
usher credentials delete cred_0123456789abcdef
```

The copy should describe that create commands are interactive, collect the label and allowed request matcher, and keep secret input out of normal command-line arguments. It should avoid documenting raw admin API credential creation as the primary user path.

## Credential Connection

The README should present two credential paths:

1. Bearer token: `usher credentials create-bearer-token` as the fastest successful path.
2. OAuth2: `usher credentials create-oauth2`, followed by opening the returned `loginUrl` in a browser before the credential can be used for `/call`.

Google OAuth2 host and path prefix examples should remain available for Calendar, Drive, and Gmail.

## Remote API Calls

The README should explain that callers invoke remote APIs through:

```sh
curl -sS 'http://localhost:3000/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fresource'
```

It should explain that `usher` resolves the credential from the target URL, applies the credential, forwards the request, and returns the upstream response. It should also mention method, body, and non-reserved header forwarding without turning the README into a full API reference.

## Security Model

The README should include a concise safety section covering:

- Admin credential endpoints are local administration paths.
- `/call` is limited by configured caller IPs.
- Stored credential secrets are encrypted with the configured key file.
- Credential secrets are not printed by list/get/create output.
- The daemon rejects ambiguous overlapping allowed request matchers.

## Structure

The final README should follow this order:

1. Hero and value proposition.
2. Why `usher` exists.
3. How the request flow works.
4. Global installation.
5. Configuration and encryption key setup.
6. Starting or installing the daemon.
7. Configuring credentials through the CLI.
8. Connecting bearer token and OAuth2 credentials.
9. Calling remote APIs through `/call`.
10. Operating and safety notes.
11. CLI and endpoint quick reference.
12. Source development.

## Validation

Review command names against `origin/main`, especially package metadata, `usher daemon start`, and `usher daemon install`. Since this is README-only work, no TypeScript verification is required unless source files are changed.
