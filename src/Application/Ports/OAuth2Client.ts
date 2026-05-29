import { Context, Effect, Redacted, Schema } from "effect";
import type { OAuth2TokenAuthMethod } from "../../Domain/Credentials/Credential.js";
import type { SemanticError } from "../../Domain/Errors/UsherErrors.js";

export const OAuth2TokenResponse = Schema.Struct({
  accessToken: Schema.Redacted(Schema.String),
  refreshToken: Schema.optional(Schema.Redacted(Schema.String)),
  scopes: Schema.optional(Schema.Array(Schema.String)),
});
export type OAuth2TokenResponse = Schema.Schema.Type<typeof OAuth2TokenResponse>;

export class OAuth2Client extends Context.Tag("OAuth2Client")<
  OAuth2Client,
  {
    readonly buildAuthorizationUrl: (input: {
      readonly authorizationUrl: string;
      readonly clientId: string;
      readonly redirectUri: string;
      readonly scopes: ReadonlyArray<string>;
      readonly state: Redacted.Redacted<string>;
      readonly codeVerifier: Redacted.Redacted<string>;
    }) => Effect.Effect<string, SemanticError>;
    readonly exchangeAuthorizationCode: (input: {
      readonly tokenUrl: string;
      readonly clientId: string;
      readonly clientSecret: Redacted.Redacted<string>;
      readonly code: string;
      readonly redirectUri: string;
      readonly codeVerifier: Redacted.Redacted<string>;
      readonly tokenAuthMethod?: OAuth2TokenAuthMethod;
    }) => Effect.Effect<OAuth2TokenResponse, SemanticError>;
    readonly refreshAccessToken: (input: {
      readonly tokenUrl: string;
      readonly clientId: string;
      readonly clientSecret: Redacted.Redacted<string>;
      readonly refreshToken: Redacted.Redacted<string>;
      readonly tokenAuthMethod?: OAuth2TokenAuthMethod;
    }) => Effect.Effect<OAuth2TokenResponse, SemanticError>;
  }
>() {}
