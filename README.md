# Usher

**The local credential gateway for agents and automations.**

Usher lets tools call remote APIs without carrying API credentials themselves. It stores OAuth2 refresh tokens and bearer tokens locally, restricts who may call it, resolves the right credential from the target URL, and forwards approved requests through a single `/call` endpoint.

Agents get the API response they asked for. Credentials stay where they belong: outside prompts, logs, scripts, and model context.

## Why Usher Exists

Modern agents are excellent at deciding what to call next. They are much less ideal places to keep long-lived secrets.

Without a broker, credentials tend to leak into places that are hard to audit: shell history, environment dumps, prompt traces, generated code, tool logs, and copied examples. Usher creates a narrow boundary between an agent and the services it needs. The agent asks Usher to call a URL. Usher decides whether the caller is allowed, finds exactly one matching credential, applies authorization, and returns the upstream response.

Usher is headless, self-hosted, and intentionally small. It does not try to understand every provider API. It gives you a secure local path for authenticated HTTP.

## How It Works

1. Install and run the `usher` daemon locally.
2. Configure credentials through the interactive CLI.
3. Give each credential an allowed origin and path prefix.
4. Send HTTP requests to `/call?url=<remote-url>`.
5. Usher matches the target URL, injects the credential, proxies the request, and returns the upstream response.

Credential IDs are for administration. API callers do not pass credential IDs to `/call`; the target URL determines which credential is used.

## Install

Usher is published as `@akoenig/usher` and exposes the `usher` binary.

### Agent-Assisted Install

Paste this prompt into your AI agent to install Usher:

```text
Install Usher locally for me.

Before installing anything, check whether Node.js is available by running `node --version`. If Node.js is missing, stop and tell me to install the current LTS release from https://nodejs.org/ before continuing.

Prefer `pnpm` for the installation. If `pnpm --version` works, use `pnpm add --global @akoenig/usher`. If pnpm is missing but Corepack is available, run `corepack enable`, then try `pnpm --version` again and use pnpm. If pnpm still is not available, use an npm-compatible global install command that is available on this machine, such as `npm install --global @akoenig/usher`.

After installation, verify the binary by running `usher --help` and report the installed command path if the shell can resolve it.
```

### Manual Install

Install Usher directly with pnpm:

```sh
pnpm add --global @akoenig/usher
```

Any npm-compatible package manager can install the package globally. The examples in this README use `pnpm`.

## Configure

Create Usher's local configuration directory and encryption key file:

```sh
mkdir -p ~/.config/usher
touch ~/.config/usher/encryption.key
chmod 600 ~/.config/usher/encryption.key
if [ ! -s ~/.config/usher/encryption.key ]; then
  node -e "console.log('base64url:' + require('node:crypto').randomBytes(32).toString('base64url'))" > ~/.config/usher/encryption.key
fi
```

The generation step leaves an existing non-empty key file unchanged.

Create `~/.config/usher/config.json`:

```sh
cat > ~/.config/usher/config.json <<EOF
{
  "databasePath": "$HOME/.config/usher/usher.sqlite",
  "encryptionKeyFile": "$HOME/.config/usher/encryption.key",
  "baseUrl": "http://localhost:3000",
  "allowedCallerIps": ["127.0.0.1", "::1"],
  "port": 3000
}
EOF
```

`port` is optional and defaults to `3000`.

The config file contains the encryption key file path. The key material itself stays in `encryption.key` so Usher can validate ownership and file permissions before loading it.

Environment variables are optional overrides, not required setup. Use them when you need to override a config file value for one process:

```sh
USHER_PORT=3131 usher daemon start
```

Available overrides are `USHER_DATABASE_PATH`, `USHER_ENCRYPTION_KEY_FILE`, `USHER_BASE_URL`, `USHER_ALLOWED_CALLER_IPS`, and `USHER_PORT`. `USHER_ALLOWED_CALLER_IPS` is comma-separated when set as an environment variable, for example `127.0.0.1,::1`.

The encryption key file must contain exactly one line:

```text
base64url:<32-byte random key encoded as base64url>
```

The file must be owned by the process user and use `0400` or `0600` permissions. Generate it once and keep it with the database. Stored credential secrets are encrypted with this key; replacing or deleting it makes existing encrypted credential material unreadable.

## Run The Daemon

Start Usher in the foreground:

```sh
usher daemon start
```

`usher daemon` is also valid and starts the same daemon flow.

On Linux systems with user-level systemd, install and start Usher as a durable user service:

```sh
usher daemon install
```

The install command writes a user service named `usher.service`, reloads the user systemd daemon, enables lingering for the current user, and starts the service.

## Configure Credentials With The CLI

Credential administration is intentionally local. Start the daemon first, then use the `usher credentials` commands from the same machine.

Create a bearer token credential interactively:

```sh
usher credentials create-bearer-token
```

Create an OAuth2 credential interactively:

```sh
usher credentials create-oauth2
```

The create commands prompt for the credential label, allowed request matcher, and secret material. Secrets are collected interactively instead of being passed as normal command-line arguments.

Inspect and manage credentials:

```sh
usher credentials list
usher credentials get cred_0123456789abcdef
usher credentials delete cred_0123456789abcdef
```

## Connect A Bearer Token

Bearer tokens are the fastest path to a working credential.

Run:

```sh
usher credentials create-bearer-token
```

When prompted, provide:

- A human-readable label, such as `Internal API`.
- The allowed origin, such as `https://api.example.com`.
- The allowed path prefix, such as `/v1/`.
- The bearer token.

After creation, Usher can apply that token to matching `/call` requests.

## Connect An OAuth2 Credential

Run:

```sh
usher credentials create-oauth2
```

The CLI prompts for provider details, client credentials, scopes, and the allowed request matcher. For OAuth2 credentials, Usher returns a login URL. Open that URL in a browser to complete authorization before using the credential for `/call`.

When using the Google OAuth2 preset, choose the API host and path prefix that match the API you want to call:

```text
Calendar: allowed origin https://www.googleapis.com, path prefix /calendar/
Drive:    allowed origin https://www.googleapis.com, path prefix /drive/
Gmail:    allowed origin https://gmail.googleapis.com, path prefix /gmail/
```

OAuth refresh tokens are stored encrypted. Access tokens are obtained as needed and are not exposed through CLI output.

## Call Remote APIs

Send approved requests through `/call` with the remote URL encoded in the `url` query parameter:

```sh
curl -sS 'http://localhost:3000/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fresource'
```

Usher resolves the target URL to one credential, applies authorization, forwards the request, and returns the upstream response. A credential with origin `https://api.example.com` and path prefix `/v1/` can authorize calls under that path.

Usher forwards the HTTP method, body, and non-reserved headers, then returns the upstream status, headers, and body as directly as possible.

Example POST request:

```sh
curl -sS \
  -X POST \
  -H 'content-type: application/json' \
  --data '{"name":"Ada"}' \
  'http://localhost:3000/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers'
```

## Safety Model

Usher is designed to make the secure path the simple path.

- Credential administration is local to the daemon.
- Admin credential endpoints are local administration paths.
- `/call` is restricted by `allowedCallerIps` from the config file or `USHER_ALLOWED_CALLER_IPS`.
- Stored credential secrets are encrypted with the configured key file.
- Credential secrets are redacted from list, get, and create output.
- Overlapping allowed request matchers are rejected so a target URL resolves to at most one credential.
- Callers do not need to know credential IDs to call remote APIs.

## Quick Reference

Common CLI commands:

```sh
usher daemon start
usher daemon install
usher credentials create-bearer-token
usher credentials create-oauth2
usher credentials list
usher credentials get cred_0123456789abcdef
usher credentials delete cred_0123456789abcdef
```

Endpoint quick reference:

```http
GET    /credentials
POST   /credentials
GET    /credentials/{credentialId}
DELETE /credentials/{credentialId}
GET    /credentials/{credentialId}/oauth2/login
GET    /oauth2/callback
<any>  /call?url=<absolute-https-target-url>
```

Configuration file:

```text
~/.config/usher/config.json
```

Required JSON fields:

```text
databasePath
encryptionKeyFile
baseUrl
allowedCallerIps
```

Optional JSON fields:

```text
port=3000
```

Example:

```json
{
  "databasePath": "/home/alice/.config/usher/usher.sqlite",
  "encryptionKeyFile": "/home/alice/.config/usher/encryption.key",
  "baseUrl": "http://localhost:3000",
  "allowedCallerIps": ["127.0.0.1", "::1"],
  "port": 3000
}
```

Replace `/home/alice` with your home directory.

Optional environment overrides:

```text
USHER_DATABASE_PATH
USHER_ENCRYPTION_KEY_FILE
USHER_BASE_URL
USHER_ALLOWED_CALLER_IPS
USHER_PORT
```

## Source Development

Install dependencies from a source checkout:

```sh
vp install
```

Run the daemon from source:

```sh
vp run dev daemon
```

Build and run the compiled daemon:

```sh
vp run build
node dist/Main.mjs daemon start
```
