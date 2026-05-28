import { Context, Effect, Layer, Match } from "effect";
import { allowedRequestMatches } from "../../Domain/Credentials/AllowedRequest.js";
import type { Credential, CredentialId } from "../../Domain/Credentials/Credential.js";
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

export const CallServiceLive = Layer.effect(
  CallService,
  Effect.gen(function* () {
    const repository = yield* CredentialRepository;
    const vault = yield* SecretVault;
    const oauth2Client = yield* OAuth2Client;
    const httpExecutor = yield* HttpExecutor;
    const auditLog = yield* AuditLog;

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

        const authorization = yield* authorizationFor(credential).pipe(
          Effect.tapError((error) =>
            failWithAudit(command, userAgent, error, credential.credentialId),
          ),
        );

        const request =
          command.body === undefined
            ? {
                method: command.method,
                url: targetUrl.toString(),
                headers: {
                  ...stripHopByHopHeaders(command.headers),
                  Authorization: authorization,
                },
              }
            : {
                method: command.method,
                url: targetUrl.toString(),
                headers: {
                  ...stripHopByHopHeaders(command.headers),
                  Authorization: authorization,
                },
                body: command.body,
              };
        const response = yield* httpExecutor
          .execute(request)
          .pipe(
            Effect.tapError((error) =>
              failWithAudit(command, userAgent, error, credential.credentialId),
            ),
          );

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

    function authorizationFor(credential: Credential) {
      if (credential.type === "BearerToken") {
        return vault
          .decrypt({
            credentialId: credential.credentialId,
            purpose: "BearerToken.token",
            ciphertext: credential.bearerToken.encryptedToken,
          })
          .pipe(Effect.map(bearerHeader));
      }

      const encryptedRefreshToken = credential.oauth2.encryptedRefreshToken;
      if (encryptedRefreshToken === undefined) {
        return Effect.fail(InvalidCredentialStatusError.make());
      }

      return Effect.gen(function* () {
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
        });

        return bearerHeader(tokenResponse.accessToken);
      });
    }

    return {
      call,
      execute: call,
    };
  }),
);

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

      return Effect.succeed(url);
    }),
  );
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

function stripHopByHopHeaders(headers: HeaderRecord): HeaderRecord {
  const connectionHeaders =
    findHeaderValue(headers, "connection")
      ?.split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== "") ?? [];
  const stripped = new Set([...hopByHopHeaderNames, ...connectionHeaders]);
  const forwarded: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!stripped.has(name.toLowerCase())) {
      forwarded[name] = value;
    }
  }

  return forwarded;
}
