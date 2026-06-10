import {
  Cookies,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { createServer } from "node:http";
import { AuditLog, AuditOutcome } from "../../Application/Ports/AuditLog.js";
import type { UpstreamResponse } from "../../Application/Ports/HttpExecutor.js";
import { CallService } from "../../Application/Services/CallService.js";
import { CredentialService } from "../../Application/Services/CredentialService.js";
import { OAuth2Service } from "../../Application/Services/OAuth2Service.js";
import {
  CredentialId,
  CreateCredentialInput,
  UpdateCredentialInput,
} from "../../Domain/Credentials/Credential.js";
import {
  CallerIpNotAllowedError,
  httpStatusFor,
  InvalidEventQueryError,
  MissingUrlError,
  RequestBodyTooLargeError,
  SemanticError,
  toErrorResponseBody,
  type SemanticError as SemanticErrorType,
} from "../../Domain/Errors/UsherErrors.js";
import { DefaultMaxBodyBytes } from "../Config/UsherConfig.js";
import { isAdminRequestAllowed, isCallRequestAllowed, normalizeSourceIp } from "./AccessControl.js";

export type HttpServerConfig = {
  readonly allowedCallerIps: ReadonlyArray<string>;
  readonly baseUrl: string;
  readonly peerAddressProvider?: PeerAddressProvider;
  readonly maxBodyBytes?: number;
};

export type PeerAddressProvider = (request: HttpServerRequest.HttpServerRequest) => string;

export type HttpListenConfig = HttpServerConfig & {
  readonly port: number;
};

export function makeHttpApp(config: HttpServerConfig) {
  return HttpRouter.empty.pipe(
    HttpRouter.get("/health", health()),
    HttpRouter.get("/events", admin(config, listEvents)),
    HttpRouter.get("/credentials", admin(config, listCredentials)),
    HttpRouter.post("/credentials", admin(config, createCredential)),
    HttpRouter.get("/credentials/:credentialId", admin(config, getCredential)),
    HttpRouter.patch("/credentials/:credentialId", admin(config, updateCredential)),
    HttpRouter.del("/credentials/:credentialId", admin(config, deleteCredential)),
    HttpRouter.get(
      "/credentials/:credentialId/oauth2/login",
      browser(() => oauth2Login(config)),
    ),
    HttpRouter.get(
      "/oauth2/callback",
      browser(() => oauth2Callback(config)),
    ),
    HttpRouter.all("/call", call(config)),
  );
}

export function HttpServerLive(config: HttpListenConfig) {
  return Layer.provide(
    HttpServer.serve(makeHttpApp(config)),
    NodeHttpServer.layer(() => createServer(), { port: config.port }),
  );
}

function admin(
  config: HttpServerConfig,
  handler: () => Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    unknown,
    | HttpServerRequest.HttpServerRequest
    | AuditLog
    | CredentialService
    | OAuth2Service
    | HttpRouter.RouteContext
    | HttpServerRequest.ParsedSearchParams
  >,
) {
  return Effect.gen(function* () {
    const sourceIp = yield* requestSourceIp(config);
    if (!isAdminRequestAllowed(sourceIp)) {
      return yield* errorResponse(CallerIpNotAllowedError.make());
    }

    return yield* handler().pipe(
      Effect.catchAll((error) => errorResponse(semanticErrorFromUnknown(error))),
    );
  });
}

const PositiveQueryInteger = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
);

const NonNegativeQueryInteger = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
);

function browser(
  handler: () => Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    unknown,
    | HttpServerRequest.HttpServerRequest
    | OAuth2Service
    | HttpRouter.RouteContext
    | HttpServerRequest.ParsedSearchParams
  >,
) {
  return handler().pipe(Effect.catchAll((error) => errorResponse(semanticErrorFromUnknown(error))));
}

function call(config: HttpServerConfig) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const sourceIp = yield* requestSourceIp(config);
    if (
      hasCloudflareProxyHeaders(request.headers) ||
      !isCallRequestAllowed(sourceIp, config.allowedCallerIps)
    ) {
      return yield* errorResponse(CallerIpNotAllowedError.make());
    }

    const targetUrl = targetUrlFrom(request.url);
    if (targetUrl === undefined) {
      return yield* errorResponse(MissingUrlError.make());
    }

    yield* Effect.logInfo(
      `${userAgentFrom(request.headers)} (${sourceIp}) ${request.method} ${targetUrl}`,
    );

    const maxBodyBytes = config.maxBodyBytes ?? DefaultMaxBodyBytes;
    if (declaredContentLength(request.headers) > maxBodyBytes) {
      return yield* errorResponse(RequestBodyTooLargeError.make());
    }

    const service = yield* CallService;
    const body = yield* request.arrayBuffer.pipe(Effect.map((buffer) => new Uint8Array(buffer)));
    if (body.byteLength > maxBodyBytes) {
      return yield* errorResponse(RequestBodyTooLargeError.make());
    }

    const response = yield* service
      .call({
        method: request.method,
        targetUrl,
        headers: request.headers,
        sourceIp,
        ...(body.byteLength === 0 ? {} : { body }),
      })
      .pipe(Effect.catchAll((error) => errorResponse(semanticErrorFromUnknown(error))));

    if (HttpServerResponse.isServerResponse(response)) {
      return response;
    }

    return upstreamServerResponse(response);
  });
}

function upstreamServerResponse(response: UpstreamResponse) {
  const base =
    response.body instanceof Uint8Array
      ? HttpServerResponse.uint8Array(response.body, {
          status: response.status,
          headers: response.headers,
        })
      : HttpServerResponse.text(response.body, {
          status: response.status,
          headers: response.headers,
        });

  if (response.setCookies === undefined || response.setCookies.length === 0) {
    return base;
  }

  return HttpServerResponse.mergeCookies(base, Cookies.fromSetCookie(response.setCookies));
}

function declaredContentLength(headers: Readonly<Record<string, string>>) {
  const declared = headers["content-length"];
  if (declared === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(declared, 10);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function health() {
  return HttpServerResponse.json({ status: "ok" });
}

function hasCloudflareProxyHeaders(headers: Readonly<Record<string, string>>) {
  return headers["cf-connecting-ip"] !== undefined || headers["cf-ray"] !== undefined;
}

function requestSourceIp(config: HttpServerConfig) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const provider = config.peerAddressProvider ?? peerAddressFromRequest;

    return provider(request);
  });
}

function peerAddressFromRequest(request: HttpServerRequest.HttpServerRequest) {
  return peerAddressForAccessControl({
    headers: request.headers,
    remoteAddress: request.remoteAddress,
  });
}

export function peerAddressForAccessControl(input: {
  readonly headers: Readonly<Record<string, string>>;
  readonly remoteAddress: Option.Option<string>;
}) {
  if (Option.isSome(input.remoteAddress)) {
    return normalizeSourceIp(input.remoteAddress.value);
  }

  return "";
}

function listCredentials() {
  return Effect.gen(function* () {
    const service = yield* CredentialService;
    const credentials = yield* service.list();

    return yield* HttpServerResponse.json(credentials);
  });
}

function listEvents() {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const service = yield* AuditLog;
    const searchParams = new URL(request.url, "http://localhost").searchParams;
    const after = searchParams.get("after");
    const filter = yield* decodeEventFilter(searchParams);

    if (after !== null) {
      const sequence = yield* decodeNonNegativeQueryInteger(after);
      const events = yield* service.readAfter(sequence, filter);

      return yield* HttpServerResponse.json(events);
    }

    const limit = yield* decodePositiveQueryInteger(searchParams.get("limit") ?? "10");
    const events = yield* service.readRecent({ limit, ...filter });

    return yield* HttpServerResponse.json(events);
  });
}

function decodeEventFilter(searchParams: URLSearchParams) {
  return Effect.gen(function* () {
    const credentialIdParam = searchParams.get("credentialId");
    const outcomeParam = searchParams.get("outcome");
    const credentialId =
      credentialIdParam === null
        ? undefined
        : yield* Schema.decodeUnknown(CredentialId)(credentialIdParam).pipe(
            Effect.mapError(() => InvalidEventQueryError.make()),
          );
    const outcome =
      outcomeParam === null
        ? undefined
        : yield* Schema.decodeUnknown(AuditOutcome)(outcomeParam).pipe(
            Effect.mapError(() => InvalidEventQueryError.make()),
          );

    return {
      ...(credentialId === undefined ? {} : { credentialId }),
      ...(outcome === undefined ? {} : { outcome }),
    };
  });
}

function createCredential() {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const service = yield* CredentialService;
    const body = yield* request.json.pipe(
      Effect.flatMap(Schema.decodeUnknown(CreateCredentialInput)),
      Effect.mapError(() => MissingUrlError.make()),
    );
    const credential = yield* service.create(body);

    return yield* HttpServerResponse.json(credential, { status: 201 });
  });
}

function getCredential() {
  return Effect.gen(function* () {
    const credentialId = yield* routeCredentialId;
    const service = yield* CredentialService;
    const credential = yield* service.getById(credentialId);

    return yield* HttpServerResponse.json(credential);
  });
}

function updateCredential() {
  return Effect.gen(function* () {
    const credentialId = yield* routeCredentialId;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const service = yield* CredentialService;
    const body = yield* request.json.pipe(
      Effect.flatMap(Schema.decodeUnknown(UpdateCredentialInput)),
      Effect.mapError(() => MissingUrlError.make()),
    );
    const credential = yield* service.update(credentialId, body);

    return yield* HttpServerResponse.json(credential);
  });
}

function deleteCredential() {
  return Effect.gen(function* () {
    const credentialId = yield* routeCredentialId;
    const service = yield* CredentialService;
    yield* service.deleteById(credentialId);

    return HttpServerResponse.empty({ status: 204 });
  });
}

function oauth2Login(config: HttpServerConfig) {
  return Effect.gen(function* () {
    const credentialId = yield* routeCredentialId;
    const service = yield* OAuth2Service;
    const url = yield* service.buildLoginUrl({
      credentialId,
      redirectUri: callbackUrl(config),
      now: new Date().toISOString(),
    });

    return HttpServerResponse.redirect(url, { status: 302 });
  });
}

function oauth2Callback(config: HttpServerConfig) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = absoluteUrl(request);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const service = yield* OAuth2Service;

    if (state === null || code === null) {
      return yield* errorResponse(MissingUrlError.make());
    }

    yield* service.handleCallback({
      state: Redacted.make(state),
      code,
      redirectUri: callbackUrl(config),
      now: new Date().toISOString(),
    });

    return HttpServerResponse.text("OAuth2 credential authorized", { status: 200 });
  });
}

const routeCredentialId = Effect.gen(function* () {
  const params = yield* HttpRouter.params;
  const credentialId = params["credentialId"];

  if (credentialId === undefined) {
    return yield* Effect.fail(MissingUrlError.make());
  }

  return yield* Schema.decodeUnknown(CredentialId)(credentialId).pipe(
    Effect.mapError(() => MissingUrlError.make()),
  );
});

function targetUrlFrom(requestUrl: string) {
  return new URL(requestUrl, "http://localhost").searchParams.get("url") ?? undefined;
}

function decodePositiveQueryInteger(value: string) {
  return Schema.decodeUnknown(PositiveQueryInteger)(value).pipe(
    Effect.mapError(() => InvalidEventQueryError.make()),
  );
}

function decodeNonNegativeQueryInteger(value: string) {
  return Schema.decodeUnknown(NonNegativeQueryInteger)(value).pipe(
    Effect.mapError(() => InvalidEventQueryError.make()),
  );
}

function userAgentFrom(headers: Readonly<Record<string, string>>) {
  return headers["user-agent"] ?? "unknown";
}

function callbackUrl(config: HttpServerConfig) {
  const url = new URL(config.baseUrl);
  url.pathname = "/oauth2/callback";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function absoluteUrl(request: HttpServerRequest.HttpServerRequest) {
  const host = request.headers["host"] ?? "localhost";

  return new URL(request.url, `http://${host}`);
}

function semanticErrorFromUnknown(error: unknown): SemanticErrorType {
  if (Schema.is(SemanticError)(error)) {
    return error;
  }

  return MissingUrlError.make();
}

function errorResponse(error: SemanticErrorType) {
  return HttpServerResponse.json(toErrorResponseBody(error), {
    status: httpStatusFor(error),
    headers: {
      "x-usher-error": "true",
      "x-usher-error-code": error.code,
    },
  });
}
