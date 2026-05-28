import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Layer, Redacted, Schema } from "effect";
import { OAuth2Client, OAuth2TokenResponse } from "../../Application/Ports/OAuth2Client.js";
import { OAuthTokenExchangeFailedError } from "../../Domain/Errors/UsherErrors.js";

const TokenEndpointResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
});

export const OAuth2HttpClient = Layer.provide(
  Layer.effect(
    OAuth2Client,
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient;

      return {
        buildAuthorizationUrl: (input) =>
          Effect.sync(() => {
            const url = new URL(input.authorizationUrl);
            url.searchParams.set("response_type", "code");
            url.searchParams.set("client_id", input.clientId);
            url.searchParams.set("redirect_uri", input.redirectUri);
            url.searchParams.set("scope", input.scopes.join(" "));
            url.searchParams.set("state", Redacted.value(input.state));
            url.searchParams.set("code_challenge", Redacted.value(input.codeVerifier));
            url.searchParams.set("code_challenge_method", "plain");

            return url.toString();
          }),
        exchangeAuthorizationCode: (input) =>
          requestToken(httpClient, input.tokenUrl, {
            grant_type: "authorization_code",
            client_id: input.clientId,
            client_secret: Redacted.value(input.clientSecret),
            code: input.code,
            redirect_uri: input.redirectUri,
            code_verifier: Redacted.value(input.codeVerifier),
          }),
        refreshAccessToken: (input) =>
          requestToken(httpClient, input.tokenUrl, {
            grant_type: "refresh_token",
            client_id: input.clientId,
            client_secret: Redacted.value(input.clientSecret),
            refresh_token: Redacted.value(input.refreshToken),
          }),
      };
    }),
  ),
  FetchHttpClient.layer,
);

function requestToken(
  httpClient: HttpClient.HttpClient,
  tokenUrl: string,
  fields: Readonly<Record<string, string>>,
) {
  return Effect.gen(function* () {
    const response = yield* HttpClientRequest.post(tokenUrl).pipe(
      HttpClientRequest.bodyUrlParams(fields),
      httpClient.execute,
      Effect.mapError(() => OAuthTokenExchangeFailedError.make()),
    );
    if (response.status >= 400) {
      const message = `OAuth token exchange failed: provider returned ${response.status}`;

      return yield* Effect.fail(OAuthTokenExchangeFailedError.make({ message }));
    }

    const json = yield* response.json.pipe(
      Effect.mapError(() => OAuthTokenExchangeFailedError.make()),
    );
    const decoded = yield* Schema.decodeUnknown(TokenEndpointResponse)(json).pipe(
      Effect.mapError(() => OAuthTokenExchangeFailedError.make()),
    );

    return yield* Schema.decodeUnknown(Schema.typeSchema(OAuth2TokenResponse))({
      accessToken: Redacted.make(decoded.access_token),
      refreshToken:
        decoded.refresh_token === undefined ? undefined : Redacted.make(decoded.refresh_token),
      scopes:
        decoded.scope === undefined
          ? undefined
          : decoded.scope.split(" ").filter((scope) => scope.length > 0),
    }).pipe(Effect.mapError(() => OAuthTokenExchangeFailedError.make()));
  });
}
