import { Effect, Layer, Redacted } from "effect";
import {
  HttpExecutor,
  type HeaderRecord,
  type PreparedOutboundRequest,
} from "../../Application/Ports/HttpExecutor.js";
import { UpstreamRequestFailedError } from "../../Domain/Errors/UsherErrors.js";

const hopByHopHeaderNames = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export const HttpExecutorLive = Layer.succeed(HttpExecutor, {
  execute: (request) => executeRequest(request),
});

function executeRequest(request: PreparedOutboundRequest) {
  return Effect.tryPromise({
    try: async () => {
      const headers = requestHeaders(request.headers);
      const response = await fetch(
        request.url,
        request.body === undefined
          ? {
              method: request.method,
              headers,
            }
          : {
              method: request.method,
              headers,
              body: request.body,
            },
      );
      const body = new Uint8Array(await response.arrayBuffer());

      return {
        status: response.status,
        headers: responseHeaders(response.headers),
        body,
      };
    },
    catch: () => UpstreamRequestFailedError.make(),
  });
}

function requestHeaders(headers: PreparedOutboundRequest["headers"]): HeaderRecord {
  const plain: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    plain[name] = requestHeaderValue(value);
  }

  return plain;
}

function requestHeaderValue(value: PreparedOutboundRequest["headers"][string]) {
  if (typeof value === "string") {
    return value;
  }
  if (Redacted.isRedacted(value)) {
    return Redacted.value(value);
  }

  return `${value.scheme} ${Redacted.value(value.token)}`;
}

function responseHeaders(headers: Headers): HeaderRecord {
  const forwarded: Record<string, string> = {};
  const connectionHeaders =
    headers
      .get("connection")
      ?.split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== "") ?? [];
  const stripped = new Set([...hopByHopHeaderNames, ...connectionHeaders]);

  headers.forEach((value, name) => {
    if (!stripped.has(name.toLowerCase())) {
      forwarded[name] = value;
    }
  });

  return forwarded;
}
