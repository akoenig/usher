# Usher

Usher is a headless HTTP credential broker. It stores OAuth2 and bearer token credentials locally, restricts callers by IP, and proxies approved requests through `/call` with the matching credential applied.

## Setup

Install dependencies:

```sh
pnpm install
```

Set the required environment variables:

```sh
export USHER_DATABASE_PATH=.usher/usher.sqlite
export USHER_ENCRYPTION_KEY_FILE=.usher/encryption.key
export USHER_BASE_URL=http://localhost:3000
export USHER_ALLOWED_CALLER_IPS=127.0.0.1,::1
export USHER_PORT=3000
```

Start from source during development:

```sh
pnpm dev
```

Build and run the compiled server:

```sh
pnpm build
node dist/Main.mjs
```

## Headless Usage

Create a bearer token credential:

```sh
curl -sS -X POST http://localhost:3000/credentials \
  -H 'content-type: application/json' \
  -d '{"type":"BearerToken","label":"example","allowedRequests":[{"url":{"origin":"https://api.example.com","pathPrefix":"/v1/"}}],"bearerToken":{"token":"secret-token"}}'
```

Proxy an allowed request through Usher:

```sh
curl -sS 'http://localhost:3000/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fresource'
```

List, fetch, and delete credentials with `GET /credentials`, `GET /credentials/:credentialId`, and `DELETE /credentials/:credentialId`.
