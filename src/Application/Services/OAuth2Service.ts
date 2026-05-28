import { randomBytes } from "node:crypto";
import { Context, Effect, Layer, Schema } from "effect";
import { Credential, CredentialId } from "../../Domain/Credentials/Credential.js";
import {
  InvalidCredentialStatusError,
  InvalidCredentialTypeError,
  OAuthTokenExchangeFailedError,
  OAuthStateInvalidError,
  type SemanticError,
} from "../../Domain/Errors/UsherErrors.js";
import { CredentialRepository } from "../Ports/CredentialRepository.js";
import { OAuth2Client } from "../Ports/OAuth2Client.js";
import { SecretVault } from "../Ports/SecretVault.js";

export class OAuth2Service extends Context.Tag("OAuth2Service")<
  OAuth2Service,
  {
    readonly buildLoginUrl: (input: {
      readonly credentialId: CredentialId;
      readonly redirectUri: string;
      readonly now: string;
    }) => Effect.Effect<string, SemanticError>;
    readonly handleCallback: (input: {
      readonly state: string;
      readonly code: string;
      readonly redirectUri: string;
      readonly now: string;
    }) => Effect.Effect<void, SemanticError>;
  }
>() {}

export function OAuth2ServiceLive(config: { readonly stateTtlMillis: number }) {
  return Layer.effect(
    OAuth2Service,
    Effect.gen(function* () {
      const repository = yield* CredentialRepository;
      const vault = yield* SecretVault;
      const oauth2Client = yield* OAuth2Client;

      return {
        buildLoginUrl: (input) =>
          Effect.gen(function* () {
            const credential = yield* repository.getById(input.credentialId);
            if (credential.type !== "OAuth2") {
              return yield* Effect.fail(InvalidCredentialTypeError.make());
            }
            if (credential.status !== "pending" && credential.status !== "error") {
              return yield* Effect.fail(InvalidCredentialStatusError.make());
            }

            const state = generateOpaqueValue("oauth_state");
            const codeVerifier = generateOpaqueValue("oauth_verifier");
            const expiresAt = new Date(Date.parse(input.now) + config.stateTtlMillis).toISOString();

            yield* repository.insertOAuthState({
              state,
              credentialId: credential.credentialId,
              codeVerifier,
              redirectUri: input.redirectUri,
              createdAt: input.now,
              expiresAt,
            });

            return yield* oauth2Client.buildAuthorizationUrl({
              authorizationUrl: credential.oauth2.authorizationUrl,
              clientId: credential.oauth2.clientId,
              redirectUri: input.redirectUri,
              scopes: credential.oauth2.scopes,
              state,
              codeVerifier,
            });
          }),
        handleCallback: (input) =>
          Effect.gen(function* () {
            const oauthState = yield* repository.consumeOAuthState({
              state: input.state,
              now: input.now,
            });
            if (oauthState.redirectUri !== input.redirectUri) {
              return yield* Effect.fail(OAuthStateInvalidError.make());
            }

            const credential = yield* repository.getById(oauthState.credentialId);
            if (credential.type !== "OAuth2") {
              return yield* Effect.fail(InvalidCredentialTypeError.make());
            }
            if (credential.status !== "pending" && credential.status !== "error") {
              return yield* Effect.fail(InvalidCredentialStatusError.make());
            }

            const clientSecret = yield* vault.decrypt({
              credentialId: credential.credentialId,
              purpose: "OAuth2.clientSecret",
              ciphertext: credential.oauth2.encryptedClientSecret,
            });
            const tokenResponse = yield* oauth2Client.exchangeAuthorizationCode({
              tokenUrl: credential.oauth2.tokenUrl,
              clientId: credential.oauth2.clientId,
              clientSecret,
              code: input.code,
              redirectUri: input.redirectUri,
              codeVerifier: oauthState.codeVerifier,
            });
            const encryptedRefreshToken =
              tokenResponse.refreshToken === undefined
                ? credential.oauth2.encryptedRefreshToken
                : yield* vault.encrypt({
                    credentialId: credential.credentialId,
                    purpose: "OAuth2.refreshToken",
                    plaintext: tokenResponse.refreshToken,
                  });

            if (encryptedRefreshToken === undefined) {
              return yield* Effect.fail(OAuthTokenExchangeFailedError.make());
            }

            const updatedCredential = Schema.decodeUnknownSync(Credential)({
              ...credential,
              status: "active",
              updatedAt: input.now,
              oauth2: {
                ...credential.oauth2,
                encryptedRefreshToken,
                grantedScopes: tokenResponse.scopes ?? credential.oauth2.grantedScopes,
              },
            });

            yield* repository.activateOAuth2CredentialFromCallback(updatedCredential);
          }),
      };
    }),
  );
}

function generateOpaqueValue(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}
