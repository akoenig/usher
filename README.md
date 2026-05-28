# Usher

Usher is a headless HTTP credential broker. It stores OAuth2 and bearer token credentials locally, restricts callers by IP, and proxies approved requests through `/call` with the matching credential applied.

## Setup

Install dependencies:

```sh
vp install
```

Set the required environment variables:

```sh
export USHER_DATABASE_PATH=.usher/usher.sqlite
export USHER_ENCRYPTION_KEY_FILE=.usher/encryption.key
export USHER_BASE_URL=http://localhost:3000
export USHER_ALLOWED_CALLER_IPS=127.0.0.1,::1
export USHER_PORT=3000
```

Create the encryption key file referenced by `USHER_ENCRYPTION_KEY_FILE`:

```sh
mkdir -p .usher
node -e "console.log('base64url:' + require('node:crypto').randomBytes(32).toString('base64url'))" > .usher/encryption.key
chmod 600 .usher/encryption.key
```

The key file must contain exactly one line in this format:

```text
base64url:<32-byte random key encoded as base64url>
```

The file must be owned by the process user and must use `0400` or `0600` permissions. Generate it once and keep it with the database; stored credential secrets are encrypted with this key, so deleting or replacing it makes existing encrypted credential material unreadable.

Start the daemon from source during development:

```sh
vp run dev daemon
```

Build and run the compiled daemon:

```sh
vp run build
node dist/Main.mjs daemon
```

## Headless Usage

The examples below use the installed `usher` binary. When running from a source checkout, replace `usher` with `vp run dev`, or use `node dist/Main.mjs` after building.

Create a bearer token credential interactively:

```sh
usher credentials create-bearer-token
```

Create an OAuth2 credential interactively:

```sh
usher credentials create-oauth2
```

Proxy an allowed request through Usher:

```sh
curl -sS 'http://localhost:3000/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fresource'
```

List, fetch, and delete credentials:

```sh
usher credentials list
usher credentials get cred_0123456789abcdef
usher credentials delete cred_0123456789abcdef
```
