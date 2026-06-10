import { Effect, Layer, Predicate, Redacted } from "effect";
import {
  connectionNamedHeaderNames,
  hopByHopHeaderNames,
  HttpExecutor,
  type HeaderRecord,
  type PreparedOutboundRequest,
} from "../../Application/Ports/HttpExecutor.js";
import { UpstreamRequestFailedError } from "../../Domain/Errors/UsherErrors.js";

export const DefaultUpstreamTimeoutMillis = 30_000;
export const DefaultMaxResponseBodyBytes = 100 * 1024 * 1024;

const nonForwardableResponseHeaderNames = new Set([
  // fetch decompresses transparently, so the encoding headers no longer
  // describe the body that is forwarded to the caller.
  "content-encoding",
  "content-length",
  // forwarded separately so multiple cookies survive the header record.
  "set-cookie",
]);

export type HttpExecutorOptions = {
  readonly timeoutMillis?: number;
  readonly maxResponseBodyBytes?: number;
};

export function HttpExecutorLive(options?: HttpExecutorOptions) {
  const timeoutMillis = options?.timeoutMillis ?? DefaultUpstreamTimeoutMillis;
  const maxResponseBodyBytes = options?.maxResponseBodyBytes ?? DefaultMaxResponseBodyBytes;

  return Layer.succeed(HttpExecutor, {
    execute: (request) => executeRequest(request, timeoutMillis, maxResponseBodyBytes),
  });
}

function executeRequest(
  request: PreparedOutboundRequest,
  timeoutMillis: number,
  maxResponseBodyBytes: number,
) {
  return Effect.tryPromise({
    try: async () => {
      const headers = requestHeaders(request.headers);
      const response = await fetch(request.url, {
        method: request.method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMillis),
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      const body = await readBodyWithLimit(response, maxResponseBodyBytes);
      const setCookies = response.headers.getSetCookie();

      return {
        status: response.status,
        headers: responseHeaders(response.headers),
        body,
        ...(setCookies.length === 0 ? {} : { setCookies }),
      };
    },
    catch: (cause) =>
      UpstreamRequestFailedError.make({
        message: `Upstream request failed: ${failureDetail(cause)}`,
      }),
  });
}

async function readBodyWithLimit(response: Response, maxBytes: number) {
  if (response.body === null) {
    return new Uint8Array(0);
  }

  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`upstream response body exceeded the maximum of ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

function failureDetail(cause: unknown) {
  const parts: Array<string> = [];
  let current: unknown = cause;

  while (parts.length < 4) {
    if (Predicate.isError(current)) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }
    if (Predicate.isString(current)) {
      parts.push(current);
    }
    break;
  }

  const detail = parts.filter((part) => part !== "").join(": ");

  return detail === "" ? "unknown cause" : detail;
}

function requestHeaders(headers: PreparedOutboundRequest["headers"]): HeaderRecord {
  const plain: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    plain[name] = requestHeaderValue(value);
  }

  return plain;
}

function requestHeaderValue(value: PreparedOutboundRequest["headers"][string]) {
  if (Predicate.isString(value)) {
    return value;
  }
  if (Redacted.isRedacted(value)) {
    return Redacted.value(value);
  }

  return `${value.scheme} ${Redacted.value(value.token)}`;
}

function responseHeaders(headers: Headers): HeaderRecord {
  const forwarded: Record<string, string> = {};
  const stripped = new Set([
    ...hopByHopHeaderNames,
    ...nonForwardableResponseHeaderNames,
    ...connectionNamedHeaderNames(headers.get("connection") ?? undefined),
  ]);

  headers.forEach((value, name) => {
    if (!stripped.has(name.toLowerCase())) {
      forwarded[name] = value;
    }
  });

  return forwarded;
}
