import { Context, Effect, Redacted } from "effect";
import type { Credential, CredentialId } from "../../Domain/Credentials/Credential.js";
import type {
  CredentialNotFoundError,
  InvalidCredentialStatusError,
  OAuthStateInvalidError,
} from "../../Domain/Errors/UsherErrors.js";

export type OAuthState = {
  readonly state: Redacted.Redacted<string>;
  readonly credentialId: CredentialId;
  readonly codeVerifier: Redacted.Redacted<string>;
  readonly redirectUri: string;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export class CredentialRepository extends Context.Tag("CredentialRepository")<
  CredentialRepository,
  {
    readonly insert: (credential: Credential) => Effect.Effect<void>;
    readonly update: (credential: Credential) => Effect.Effect<void, CredentialNotFoundError>;
    readonly activateOAuth2CredentialFromCallback: (
      credential: Credential,
    ) => Effect.Effect<void, InvalidCredentialStatusError>;
    readonly list: () => Effect.Effect<ReadonlyArray<Credential>>;
    readonly getById: (
      credentialId: CredentialId,
    ) => Effect.Effect<Credential, CredentialNotFoundError>;
    readonly deleteById: (
      credentialId: CredentialId,
    ) => Effect.Effect<void, CredentialNotFoundError>;
    readonly findAllNonDeleted: () => Effect.Effect<ReadonlyArray<Credential>>;
    readonly insertOAuthState: (state: OAuthState) => Effect.Effect<void>;
    readonly consumeOAuthState: (input: {
      readonly state: Redacted.Redacted<string>;
      readonly now: string;
    }) => Effect.Effect<OAuthState, OAuthStateInvalidError>;
  }
>() {}
