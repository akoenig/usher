# Call Endpoint Info Logging Design

## Context

GitHub issue #2 requests INFO logging for incoming requests against the `/call` endpoint. The current `/call` route is implemented in `src/Infrastructure/Http/HttpServer.ts`, where it already resolves the request, caller IP, HTTP method, and target URL before invoking `CallService`.

## Goal

Log one INFO message for each accepted `/call` request with request metadata only. The log content must use this order: user agent, source IP in parentheses, method, target URL.

Example shape:

```text
usher-test (127.0.0.1) POST https://api.example.com/v1/users
```

If the request has no `user-agent` header, log `unknown` in the user-agent position.

## Non-Goals

- Do not log request bodies.
- Do not log authorization headers or credential material.
- Do not log upstream response status or semantic error outcomes.
- Do not add a general HTTP access logging system.

## Architecture

Add the log in the existing infrastructure HTTP handler for `/call`. The handler is the right boundary because it already has the transport-specific metadata and because the application `CallService` should not need a user-agent field only to support HTTP logging.

The log should be emitted after access control succeeds and after the `url` query parameter is validated. Requests rejected before that point should continue returning the existing error responses without the new `/call` info log.

## Data Flow

1. `/call` receives a request.
2. The handler resolves the source IP using the existing access-control path.
3. The handler verifies the caller is allowed.
4. The handler extracts and validates the target URL.
5. The handler logs at INFO: user agent, source IP, method, target URL.
6. Existing body extraction, `CallService.call`, and response conversion continue unchanged.

## Error Handling

The log operation should not change existing error behavior. Missing or invalid request data continues to produce the existing semantic error responses. Missing `user-agent` is not an error and should be represented as `unknown`.

## Testing

Add a focused `HttpServer.spec.ts` test around the `/call` route. The test should execute a successful call with a known user-agent and peer IP, capture Effect logs, and assert that an INFO log is emitted with the expected ordered metadata.

Existing behavior tests should remain intact, and the implementation must pass `pnpm typecheck` after the implementation turn.
