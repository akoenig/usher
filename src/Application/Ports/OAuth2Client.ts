import { Context, Effect, Schema } from "effect";
import type { SemanticError } from "../../Domain/Errors/UsherErrors.js";

export const OAuth2TokenResponse = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.optional(Schema.String),
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
      readonly state: string;
      readonly codeVerifier: string;
    }) => Effect.Effect<string, SemanticError>;
    readonly exchangeAuthorizationCode: (input: {
      readonly tokenUrl: string;
      readonly clientId: string;
      readonly clientSecret: string;
      readonly code: string;
      readonly redirectUri: string;
      readonly codeVerifier: string;
    }) => Effect.Effect<OAuth2TokenResponse, SemanticError>;
    readonly refreshAccessToken: (input: {
      readonly tokenUrl: string;
      readonly clientId: string;
      readonly clientSecret: string;
      readonly refreshToken: string;
    }) => Effect.Effect<OAuth2TokenResponse, SemanticError>;
  }
>() {}
