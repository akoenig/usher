import {
  Clock,
  Context,
  Data,
  Effect,
  HashMap,
  Layer,
  Match,
  Option,
  Predicate,
  Ref,
  Schema,
} from "effect";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { allowedRequestMatches } from "../../Domain/Credentials/AllowedRequest.js";
import {
  Credential as CredentialSchema,
  type Credential,
  type CredentialId,
} from "../../Domain/Credentials/Credential.js";
import {
  InvalidCredentialStatusError,
  InvalidTargetUrlError,
  MissingUserAgentError,
  NoMatchingCredentialError,
  OAuthTokenExchangeFailedError,
  ReservedHeaderError,
  UpstreamRequestFailedError,
  type SemanticError,
} from "../../Domain/Errors/UsherErrors.js";
import { AuditLog, type AuditOutcome } from "../Ports/AuditLog.js";
import { CredentialRepository } from "../Ports/CredentialRepository.js";
import {
  connectionNamedHeaderNames,
  hopByHopHeaderNames,
  HttpExecutor,
  type BearerHeaderValue,
  type HeaderRecord,
  type OutboundBody,
  type UpstreamResponse,
} from "../Ports/HttpExecutor.js";
import { OAuth2Client } from "../Ports/OAuth2Client.js";
import { SecretVault } from "../Ports/SecretVault.js";

export type CallCommand = {
  readonly method: string;
  readonly targetUrl: string;
  readonly headers: HeaderRecord;
  readonly body?: OutboundBody;
  readonly sourceIp: string;
};

export class CallService extends Context.Tag("CallService")<
  CallService,
  {
    readonly call: (input: CallCommand) => Effect.Effect<UpstreamResponse, SemanticError>;
    readonly execute: (input: CallCommand) => Effect.Effect<UpstreamResponse, SemanticError>;
  }
>() {}

const AccessTokenExpiryBufferMillis = 60_000;

type CachedAccessToken = {
  readonly authorization: BearerHeaderValue;
  readonly expiresAtMillis: number;
};

type ResolvedAuthorization = {
  readonly authorization: BearerHeaderValue;
  readonly fromCache: boolean;
};

export const CallServiceLive = Layer.effect(
  CallService,
  Effect.gen(function* () {
    const repository = yield* CredentialRepository;
    const vault = yield* SecretVault;
    const oauth2Client = yield* OAuth2Client;
    const httpExecutor = yield* HttpExecutor;
    const auditLog = yield* AuditLog;
    const accessTokenCache = yield* Ref.make(HashMap.empty<CredentialId, CachedAccessToken>());
    const refreshLocks = yield* SynchronizedRef.make(
      HashMap.empty<CredentialId, Effect.Semaphore>(),
    );

    function refreshLockFor(credentialId: CredentialId) {
      return SynchronizedRef.modifyEffect(refreshLocks, (locks) =>
        Option.match(HashMap.get(locks, credentialId), {
          onSome: (lock) => Effect.succeed(Data.tuple(lock, locks)),
          onNone: () =>
            Effect.makeSemaphore(1).pipe(
              Effect.map((lock) => Data.tuple(lock, HashMap.set(locks, credentialId, lock))),
            ),
        }),
      );
    }

    function invalidateCachedAccessToken(credentialId: CredentialId) {
      return Ref.update(accessTokenCache, HashMap.remove(credentialId));
    }

    function recordOutcome(input: {
      readonly command: CallCommand;
      readonly userAgent: string;
      readonly matchedCredentialId?: CredentialId;
      readonly upstreamStatus?: number;
      readonly errorCode?: string;
      readonly outcome: AuditOutcome;
    }) {
      return auditLog.record({
        timestamp: new Date().toISOString(),
        sourceIp: input.command.sourceIp,
        userAgent: input.userAgent,
        method: input.command.method,
        targetUrl: input.command.targetUrl,
        ...(input.matchedCredentialId === undefined
          ? {}
          : { matchedCredentialId: input.matchedCredentialId }),
        ...(input.upstreamStatus === undefined ? {} : { upstreamStatus: input.upstreamStatus }),
        ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
        outcome: input.outcome,
      });
    }

    function failWithAudit(
      command: CallCommand,
      userAgent: string,
      error: SemanticError,
      matchedCredentialId?: CredentialId,
    ) {
      const outcome = auditOutcomeFor(error);

      if (matchedCredentialId === undefined) {
        return recordOutcome({
          command,
          userAgent,
          errorCode: error.code,
          outcome,
        }).pipe(Effect.zipRight(Effect.fail(error)));
      }

      return recordOutcome({
        command,
        userAgent,
        matchedCredentialId,
        errorCode: error.code,
        outcome,
      }).pipe(Effect.zipRight(Effect.fail(error)));
    }

    function call(command: CallCommand) {
      return Effect.gen(function* () {
        const targetUrl = yield* validateTargetUrl(command.targetUrl).pipe(
          Effect.tapError((error) =>
            recordOutcome({
              command,
              userAgent: userAgentOrMissing(command.headers),
              errorCode: error.code,
              outcome: "denied",
            }),
          ),
        );

        const userAgent = findHeaderValue(command.headers, "user-agent");
        if (userAgent === undefined || userAgent.trim() === "") {
          return yield* failWithAudit(command, "(missing)", MissingUserAgentError.make());
        }

        if (findHeaderValue(command.headers, "authorization") !== undefined) {
          return yield* failWithAudit(command, userAgent, ReservedHeaderError.make());
        }

        const credentials = yield* repository.findAllNonDeleted();
        const matches = credentials.filter(
          (credential) =>
            credential.status === "active" &&
            credential.allowedRequests.some((allowedRequest) =>
              allowedRequestMatches(allowedRequest, targetUrl),
            ),
        );

        if (matches.length !== 1) {
          return yield* failWithAudit(command, userAgent, NoMatchingCredentialError.make());
        }

        const credential = matches[0];
        if (credential === undefined) {
          return yield* failWithAudit(command, userAgent, NoMatchingCredentialError.make());
        }

        const matchedCredential = credential;
        const callerUserAgent = userAgent;

        function executeUpstream(authorization: BearerHeaderValue) {
          return httpExecutor
            .execute(preparedRequest(command, targetUrl, authorization))
            .pipe(
              Effect.tapError((error) =>
                failWithAudit(command, callerUserAgent, error, matchedCredential.credentialId),
              ),
            );
        }

        function resolveAuthorization() {
          return authorizationFor(matchedCredential).pipe(
            Effect.tapError((error) =>
              failWithAudit(command, callerUserAgent, error, matchedCredential.credentialId),
            ),
          );
        }

        const resolved = yield* resolveAuthorization();
        const firstResponse = yield* executeUpstream(resolved.authorization);

        const response = yield* retryOnExpiredCachedToken(credential, resolved, firstResponse, {
          resolveAuthorization,
          executeUpstream,
        });

        yield* recordOutcome({
          command,
          userAgent,
          matchedCredentialId: credential.credentialId,
          upstreamStatus: response.status,
          outcome: "allowed",
        });

        return response;
      });
    }

    function retryOnExpiredCachedToken(
      credential: Credential,
      resolved: ResolvedAuthorization,
      response: UpstreamResponse,
      handlers: {
        readonly resolveAuthorization: () => Effect.Effect<ResolvedAuthorization, SemanticError>;
        readonly executeUpstream: (
          authorization: BearerHeaderValue,
        ) => Effect.Effect<UpstreamResponse, SemanticError>;
      },
    ) {
      if (response.status !== 401 || credential.type !== "OAuth2" || !resolved.fromCache) {
        return Effect.succeed(response);
      }

      return Effect.gen(function* () {
        yield* invalidateCachedAccessToken(credential.credentialId);
        const fresh = yield* handlers.resolveAuthorization();

        return yield* handlers.executeUpstream(fresh.authorization);
      });
    }

    function authorizationFor(
      credential: Credential,
    ): Effect.Effect<ResolvedAuthorization, SemanticError> {
      if (credential.type === "BearerToken") {
        return vault
          .decrypt({
            credentialId: credential.credentialId,
            purpose: "BearerToken.token",
            ciphertext: credential.bearerToken.encryptedToken,
          })
          .pipe(
            Effect.map((token) => ({
              authorization: bearerHeader(token),
              fromCache: false,
            })),
          );
      }

      return Effect.gen(function* () {
        const lock = yield* refreshLockFor(credential.credentialId);

        return yield* lock.withPermits(1)(
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const cache = yield* Ref.get(accessTokenCache);
            const cached = HashMap.get(cache, credential.credentialId);

            if (Option.isSome(cached) && cached.value.expiresAtMillis > now) {
              return { authorization: cached.value.authorization, fromCache: true };
            }

            const authorization = yield* refreshOAuth2Authorization(credential, now);

            return { authorization, fromCache: false };
          }),
        );
      });
    }

    function refreshOAuth2Authorization(credential: Credential, nowMillis: number) {
      return Effect.gen(function* () {
        if (credential.type !== "OAuth2") {
          return yield* Effect.fail(InvalidCredentialStatusError.make());
        }

        const encryptedRefreshToken = credential.oauth2.encryptedRefreshToken;
        if (Predicate.isUndefined(encryptedRefreshToken)) {
          return yield* Effect.fail(InvalidCredentialStatusError.make());
        }

        const clientSecret = yield* vault.decrypt({
          credentialId: credential.credentialId,
          purpose: "OAuth2.clientSecret",
          ciphertext: credential.oauth2.encryptedClientSecret,
        });
        const refreshToken = yield* vault.decrypt({
          credentialId: credential.credentialId,
          purpose: "OAuth2.refreshToken",
          ciphertext: encryptedRefreshToken,
        });
        const tokenResponse = yield* oauth2Client.refreshAccessToken({
          tokenUrl: credential.oauth2.tokenUrl,
          clientId: credential.oauth2.clientId,
          clientSecret,
          refreshToken,
          tokenAuthMethod: credential.oauth2.tokenAuthMethod ?? "client_secret_post",
        });

        if (Predicate.isNotUndefined(tokenResponse.refreshToken)) {
          const rotatedRefreshToken = yield* vault.encrypt({
            credentialId: credential.credentialId,
            purpose: "OAuth2.refreshToken",
            plaintext: tokenResponse.refreshToken,
          });
          const updatedCredential = yield* Schema.decodeUnknown(CredentialSchema)({
            ...credential,
            updatedAt: new Date().toISOString(),
            oauth2: {
              ...credential.oauth2,
              encryptedRefreshToken: rotatedRefreshToken,
            },
          }).pipe(Effect.orDie);

          yield* repository.update(updatedCredential);
        }

        const authorization = bearerHeader(tokenResponse.accessToken);

        if (Predicate.isNotUndefined(tokenResponse.expiresInSeconds)) {
          const expiresAtMillis =
            nowMillis + tokenResponse.expiresInSeconds * 1000 - AccessTokenExpiryBufferMillis;

          if (expiresAtMillis > nowMillis) {
            yield* Ref.update(
              accessTokenCache,
              HashMap.set(credential.credentialId, { authorization, expiresAtMillis }),
            );
          }
        }

        return authorization;
      });
    }

    return {
      call,
      execute: call,
    };
  }),
);

function preparedRequest(command: CallCommand, targetUrl: URL, authorization: BearerHeaderValue) {
  const headers = {
    ...stripNonForwardableRequestHeaders(command.headers),
    Authorization: authorization,
  };

  return command.body === undefined
    ? {
        method: command.method,
        url: targetUrl.toString(),
        headers,
      }
    : {
        method: command.method,
        url: targetUrl.toString(),
        headers,
        body: command.body,
      };
}

function bearerHeader(token: BearerHeaderValue["token"]): BearerHeaderValue {
  return { scheme: "Bearer", token };
}

function auditOutcomeFor(error: SemanticError): AuditOutcome {
  return Match.value(error).pipe(
    Match.when(Match.instanceOf(UpstreamRequestFailedError), errorOutcome),
    Match.when(Match.instanceOf(OAuthTokenExchangeFailedError), errorOutcome),
    Match.orElse(deniedOutcome),
  );
}

function errorOutcome(): AuditOutcome {
  return "error";
}

function deniedOutcome(): AuditOutcome {
  return "denied";
}

function validateTargetUrl(value: string) {
  return Effect.try({
    try: () => new URL(value),
    catch: () => InvalidTargetUrlError.make(),
  }).pipe(
    Effect.flatMap((url) => {
      if (url.protocol !== "https:" || url.hash !== "") {
        return Effect.fail(InvalidTargetUrlError.make());
      }
      if (containsEncodedPathTraversal(url.pathname)) {
        return Effect.fail(
          InvalidTargetUrlError.make({
            message: "Target URL path contains encoded traversal segments",
          }),
        );
      }

      return Effect.succeed(url);
    }),
  );
}

const MaxPathDecodeRounds = 3;

const hasDotSegment: Predicate.Predicate<string> = Predicate.some([
  (path: string) => path.includes("/../"),
  (path: string) => path.endsWith("/.."),
  (path: string) => path.includes("/./"),
  (path: string) => path.endsWith("/."),
]);

function containsEncodedPathTraversal(pathname: string) {
  let current = pathname;

  for (let round = 0; round < MaxPathDecodeRounds; round = round + 1) {
    const decoded = decodePathnameOrUndefined(current);
    if (Predicate.isUndefined(decoded)) {
      return false;
    }
    if (containsTraversalSegments(decoded)) {
      return true;
    }
    if (decoded === current) {
      return false;
    }
    current = decoded;
  }

  return false;
}

function containsTraversalSegments(path: string) {
  return hasDotSegment(path.replaceAll("\\", "/"));
}

function decodePathnameOrUndefined(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

function findHeaderValue(headers: HeaderRecord, lowerCaseName: string) {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === lowerCaseName) {
      return value;
    }
  }
}

function userAgentOrMissing(headers: HeaderRecord) {
  const userAgent = findHeaderValue(headers, "user-agent");

  if (userAgent === undefined || userAgent.trim() === "") {
    return "(missing)";
  }

  return userAgent;
}

const nonForwardableRequestHeaderNames = new Set([
  // the upstream host is derived from the target url, and the executor
  // computes content negotiation and framing headers for the new request.
  "host",
  "content-length",
  "accept-encoding",
  "expect",
]);

function stripNonForwardableRequestHeaders(headers: HeaderRecord): HeaderRecord {
  const stripped = new Set([
    ...hopByHopHeaderNames,
    ...nonForwardableRequestHeaderNames,
    ...connectionNamedHeaderNames(findHeaderValue(headers, "connection")),
  ]);
  const forwarded: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!stripped.has(name.toLowerCase())) {
      forwarded[name] = value;
    }
  }

  return forwarded;
}
