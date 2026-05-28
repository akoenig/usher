import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Effect, Either, Layer, Schema } from "effect";
import { OAuth2Client, OAuth2TokenResponse } from "../../Application/Ports/OAuth2Client.js";
import { OAuthTokenExchangeFailedError } from "../../Domain/Errors/UsherErrors.js";

const TokenEndpointResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
});

const TokenEndpointErrorResponse = Schema.Struct({
  error: Schema.optional(Schema.String),
  error_description: Schema.optional(Schema.String),
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
            url.searchParams.set("state", input.state);
            url.searchParams.set("code_challenge", input.codeVerifier);
            url.searchParams.set("code_challenge_method", "plain");

            return url.toString();
          }),
        exchangeAuthorizationCode: (input) =>
          requestToken(httpClient, input.tokenUrl, {
            grant_type: "authorization_code",
            client_id: input.clientId,
            client_secret: input.clientSecret,
            code: input.code,
            redirect_uri: input.redirectUri,
            code_verifier: input.codeVerifier,
          }),
        refreshAccessToken: (input) =>
          requestToken(httpClient, input.tokenUrl, {
            grant_type: "refresh_token",
            client_id: input.clientId,
            client_secret: input.clientSecret,
            refresh_token: input.refreshToken,
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
    const body = new URLSearchParams(fields);
    const response = yield* HttpClientRequest.post(tokenUrl).pipe(
      HttpClientRequest.setHeader("content-type", "application/x-www-form-urlencoded"),
      HttpClientRequest.bodyText(body.toString()),
      httpClient.execute,
      Effect.mapError(() => OAuthTokenExchangeFailedError.make()),
    );
    if (response.status >= 400) {
      const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));
      const message = yield* providerErrorMessage(response.status, bodyText);

      return yield* Effect.fail(OAuthTokenExchangeFailedError.make({ message }));
    }

    const json = yield* response.json.pipe(
      Effect.mapError(() => OAuthTokenExchangeFailedError.make()),
    );
    const decoded = yield* Schema.decodeUnknown(TokenEndpointResponse)(json).pipe(
      Effect.mapError(() => OAuthTokenExchangeFailedError.make()),
    );

    return yield* Schema.decodeUnknown(OAuth2TokenResponse)({
      accessToken: decoded.access_token,
      refreshToken: decoded.refresh_token,
      scopes:
        decoded.scope === undefined
          ? undefined
          : decoded.scope.split(" ").filter((scope) => scope.length > 0),
    }).pipe(Effect.mapError(() => OAuthTokenExchangeFailedError.make()));
  });
}

function providerErrorMessage(status: number, bodyText: string) {
  return parseProviderErrorBody(bodyText).pipe(
    Effect.map((decoded) => {
      const base = `OAuth token exchange failed: provider returned ${status}`;

      if (Either.isRight(decoded)) {
        const providerError = decoded.right.error;
        const providerDescription = decoded.right.error_description;

        if (providerError !== undefined && providerDescription !== undefined) {
          return `${base} ${providerError}: ${providerDescription}`;
        }
        if (providerError !== undefined) {
          return `${base} ${providerError}`;
        }
        if (providerDescription !== undefined) {
          return `${base}: ${providerDescription}`;
        }
      }

      const trimmedBody = bodyText.trim();

      return trimmedBody.length === 0 ? base : `${base}: ${trimmedBody}`;
    }),
  );
}

function parseProviderErrorBody(bodyText: string) {
  return Effect.sync(() => {
    try {
      const parsed: unknown = JSON.parse(bodyText);

      return Schema.decodeUnknownEither(TokenEndpointErrorResponse)(parsed);
    } catch {
      return Schema.decodeUnknownEither(TokenEndpointErrorResponse)(undefined);
    }
  });
}
