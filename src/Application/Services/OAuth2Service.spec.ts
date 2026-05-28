import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer, Redacted, Ref } from "effect";
import type { Credential } from "../../Domain/Credentials/Credential.js";
import {
  CredentialNotFoundError,
  InvalidCredentialStatusError,
  OAuthStateInvalidError,
  OAuthTokenExchangeFailedError,
} from "../../Domain/Errors/UsherErrors.js";
import { CredentialRepository, type OAuthState } from "../Ports/CredentialRepository.js";
import { OAuth2Client } from "../Ports/OAuth2Client.js";
import { SecretVault } from "../Ports/SecretVault.js";
import { OAuth2Service, OAuth2ServiceLive } from "./OAuth2Service.js";

describe("OAuth2Service", () => {
  it.effect("login URL generation creates a state and includes it in authorization URL", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([]);
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* OAuth2Service;

          const loginUrl = yield* service.buildLoginUrl({
            credentialId: "cred_0123456789abcdef",
            redirectUri: "https://usher.example.com/oauth2/callback",
            now: "2026-05-27T00:00:00.000Z",
          });
          const insertedStates = yield* Ref.get(states);

          return { loginUrl, insertedStates };
        }),
        makeLayer(stored, states),
      );

      assert.strictEqual(result.insertedStates.length, 1);
      const state = result.insertedStates[0];
      if (state === undefined) {
        assert.fail("Expected OAuth state");
      } else {
        assert.strictEqual(state.credentialId, "cred_0123456789abcdef");
        assert.strictEqual(state.createdAt, "2026-05-27T00:00:00.000Z");
        assert.strictEqual(state.expiresAt, "2026-05-27T00:10:00.000Z");
        assert.assertTrue(result.loginUrl.includes(`state=${Redacted.value(state.state)}`));
      }
    }),
  );

  it.effect("callback rejects invalid state with OAuthStateInvalidError", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([]);
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* OAuth2Service;

            return yield* service.handleCallback({
              state: Redacted.make("missing-state"),
              code: "authorization-code",
              redirectUri: "https://usher.example.com/oauth2/callback",
              now: "2026-05-27T00:01:00.000Z",
            });
          }),
          makeLayer(stored, states),
        ),
      );

      assert.assertInstanceOf(error, OAuthStateInvalidError);
    }),
  );

  it.effect("login URL generation rejects active OAuth2 credentials", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makeActiveOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([]);
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* OAuth2Service;

            return yield* service.buildLoginUrl({
              credentialId: "cred_0123456789abcdef",
              redirectUri: "https://usher.example.com/oauth2/callback",
              now: "2026-05-27T00:00:00.000Z",
            });
          }),
          makeLayer(stored, states),
        ),
      );

      assert.assertInstanceOf(error, InvalidCredentialStatusError);
      assert.deepStrictEqual(yield* Ref.get(states), []);
    }),
  );

  it.effect("callback rejects expired state with OAuthStateInvalidError", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
        makeOAuthState("expired-state", "2026-05-27T00:00:30.000Z"),
      ]);
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* OAuth2Service;

            return yield* service.handleCallback({
              state: Redacted.make("expired-state"),
              code: "authorization-code",
              redirectUri: "https://usher.example.com/oauth2/callback",
              now: "2026-05-27T00:01:00.000Z",
            });
          }),
          makeLayer(stored, states),
        ),
      );

      assert.assertInstanceOf(error, OAuthStateInvalidError);
    }),
  );

  it.effect("callback exchanges code and activates credential", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
        makeOAuthState("oauth-state", "2026-05-27T00:10:00.000Z"),
      ]);
      const exchangedCodes = yield* Ref.make<ReadonlyArray<string>>([]);

      yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* OAuth2Service;

          yield* service.handleCallback({
            state: Redacted.make("oauth-state"),
            code: "authorization-code",
            redirectUri: "https://usher.example.com/oauth2/callback",
            now: "2026-05-27T00:01:00.000Z",
          });
        }),
        makeLayer(stored, states, exchangedCodes),
      );

      const credentials = yield* Ref.get(stored);
      const credential = credentials[0];
      if (credential === undefined || credential.type !== "OAuth2") {
        assert.fail("Expected OAuth2 credential");
      } else {
        assert.deepStrictEqual(yield* Ref.get(exchangedCodes), ["authorization-code"]);
        assert.strictEqual(credential.status, "active");
        assert.deepStrictEqual(credential.oauth2.grantedScopes, ["calendar.readonly"]);
      }
    }),
  );

  it.effect("callback encrypts refresh token without exposing raw refresh token", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
        makeOAuthState("oauth-state", "2026-05-27T00:10:00.000Z"),
      ]);

      yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* OAuth2Service;

          return yield* service.handleCallback({
            state: Redacted.make("oauth-state"),
            code: "authorization-code",
            redirectUri: "https://usher.example.com/oauth2/callback",
            now: "2026-05-27T00:01:00.000Z",
          });
        }),
        makeLayer(stored, states),
      );

      const credentials = yield* Ref.get(stored);
      const credential = credentials[0];
      if (credential === undefined || credential.type !== "OAuth2") {
        assert.fail("Expected OAuth2 credential");
      } else {
        assert.strictEqual(
          credential.oauth2.encryptedRefreshToken,
          "encrypted:OAuth2.refreshToken:refresh-token",
        );
        assert.assertFalse(JSON.stringify(credential).includes('"refresh-token"'));
      }
    }),
  );

  it.effect(
    "callback without refresh token on first authorization fails and leaves credential non-active",
    () =>
      Effect.gen(function* () {
        const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
        const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
          makeOAuthState("oauth-state", "2026-05-27T00:10:00.000Z"),
        ]);
        const error = yield* Effect.flip(
          Effect.provide(
            Effect.gen(function* () {
              const service = yield* OAuth2Service;

              return yield* service.handleCallback({
                state: Redacted.make("oauth-state"),
                code: "authorization-code",
                redirectUri: "https://usher.example.com/oauth2/callback",
                now: "2026-05-27T00:01:00.000Z",
              });
            }),
            makeLayer(stored, states, undefined, { refreshToken: "omit" }),
          ),
        );
        const credentials = yield* Ref.get(stored);
        const credential = credentials[0];

        assert.assertInstanceOf(error, OAuthTokenExchangeFailedError);
        assert.strictEqual(credential?.status, "pending");
      }),
  );

  it.effect("state is one-time-use", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
        makeOAuthState("oauth-state", "2026-05-27T00:10:00.000Z"),
      ]);
      const program = Effect.gen(function* () {
        const service = yield* OAuth2Service;
        const callback = {
          state: Redacted.make("oauth-state"),
          code: "authorization-code",
          redirectUri: "https://usher.example.com/oauth2/callback",
          now: "2026-05-27T00:01:00.000Z",
        };

        yield* service.handleCallback(callback);
        return yield* service.handleCallback(callback);
      });

      const error = yield* Effect.flip(Effect.provide(program, makeLayer(stored, states)));

      assert.assertInstanceOf(error, OAuthStateInvalidError);
    }),
  );

  it.effect("callback rejects a second valid state after credential activation", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
      const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
        makeOAuthState("first-state", "2026-05-27T00:10:00.000Z"),
        makeOAuthState("second-state", "2026-05-27T00:10:00.000Z"),
      ]);
      const exchangedCodes = yield* Ref.make<ReadonlyArray<string>>([]);
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* OAuth2Service;

            yield* service.handleCallback({
              state: Redacted.make("first-state"),
              code: "first-code",
              redirectUri: "https://usher.example.com/oauth2/callback",
              now: "2026-05-27T00:01:00.000Z",
            });

            return yield* service.handleCallback({
              state: Redacted.make("second-state"),
              code: "second-code",
              redirectUri: "https://usher.example.com/oauth2/callback",
              now: "2026-05-27T00:02:00.000Z",
            });
          }),
          makeLayer(stored, states, exchangedCodes),
        ),
      );
      const credentials = yield* Ref.get(stored);
      const credential = credentials[0];

      assert.assertInstanceOf(error, InvalidCredentialStatusError);
      assert.deepStrictEqual(yield* Ref.get(exchangedCodes), ["first-code"]);
      if (credential === undefined || credential.type !== "OAuth2") {
        assert.fail("Expected OAuth2 credential");
      } else {
        assert.strictEqual(
          credential.oauth2.encryptedRefreshToken,
          "encrypted:OAuth2.refreshToken:refresh-token",
        );
        assert.deepStrictEqual(credential.oauth2.grantedScopes, ["calendar.readonly"]);
      }
    }),
  );

  it.effect(
    "callback rejects stale activation when credential status changed after token exchange",
    () =>
      Effect.gen(function* () {
        const stored = yield* Ref.make<ReadonlyArray<Credential>>([makePendingOAuth2Credential()]);
        const states = yield* Ref.make<ReadonlyArray<OAuthState>>([
          makeOAuthState("oauth-state", "2026-05-27T00:10:00.000Z"),
        ]);
        const exchangedCodes = yield* Ref.make<ReadonlyArray<string>>([]);
        const error = yield* Effect.flip(
          Effect.provide(
            Effect.gen(function* () {
              const service = yield* OAuth2Service;

              return yield* service.handleCallback({
                state: Redacted.make("oauth-state"),
                code: "authorization-code",
                redirectUri: "https://usher.example.com/oauth2/callback",
                now: "2026-05-27T00:01:00.000Z",
              });
            }),
            makeLayer(stored, states, exchangedCodes, {
              refreshToken: "include",
              staleBeforeUpdate: true,
            }),
          ),
        );
        const credentials = yield* Ref.get(stored);
        const credential = credentials[0];

        assert.assertInstanceOf(error, InvalidCredentialStatusError);
        assert.deepStrictEqual(yield* Ref.get(exchangedCodes), ["authorization-code"]);
        assert.strictEqual(credential?.status, "active");
        if (credential === undefined || credential.type !== "OAuth2") {
          assert.fail("Expected OAuth2 credential");
        } else {
          assert.strictEqual(credential.oauth2.encryptedRefreshToken, undefined);
        }
      }),
  );
});

function makeLayer(
  stored: Ref.Ref<ReadonlyArray<Credential>>,
  states: Ref.Ref<ReadonlyArray<OAuthState>>,
  exchangedCodes?: Ref.Ref<ReadonlyArray<string>>,
  options?: { readonly refreshToken: "include" | "omit"; readonly staleBeforeUpdate?: boolean },
) {
  return Layer.provide(
    OAuth2ServiceLive({ stateTtlMillis: 600_000 }),
    Layer.mergeAll(
      Layer.succeed(CredentialRepository, makeCredentialRepository(stored, states, options)),
      Layer.succeed(SecretVault, makeSecretVault()),
      Layer.succeed(OAuth2Client, makeOAuth2Client(exchangedCodes, options)),
    ),
  );
}

function makeCredentialRepository(
  stored: Ref.Ref<ReadonlyArray<Credential>>,
  states: Ref.Ref<ReadonlyArray<OAuthState>>,
  options?: { readonly staleBeforeUpdate?: boolean },
) {
  return {
    insert: (credential: Credential) =>
      Ref.update(stored, (credentials) => [...credentials, credential]),
    update: (credential: Credential) =>
      Effect.gen(function* () {
        yield* Ref.update(stored, (credentials) =>
          credentials.map((storedCredential) =>
            storedCredential.credentialId === credential.credentialId
              ? credential
              : storedCredential,
          ),
        );
      }),
    activateOAuth2CredentialFromCallback: (credential: Credential) =>
      Effect.gen(function* () {
        if (options?.staleBeforeUpdate === true) {
          yield* Ref.update(stored, (credentials) =>
            credentials.map((storedCredential) =>
              storedCredential.credentialId === credential.credentialId
                ? { ...storedCredential, status: "active" }
                : storedCredential,
            ),
          );
        }

        const activated = yield* Ref.modify(stored, (credentials) => {
          const current = credentials.find(
            (storedCredential) => storedCredential.credentialId === credential.credentialId,
          );
          if (
            current === undefined ||
            (current.status !== "pending" && current.status !== "error")
          ) {
            return [false, credentials];
          }

          return [
            true,
            credentials.map((storedCredential) =>
              storedCredential.credentialId === credential.credentialId
                ? credential
                : storedCredential,
            ),
          ];
        });

        if (!activated) {
          return yield* Effect.fail(InvalidCredentialStatusError.make());
        }
      }),
    list: () => Ref.get(stored),
    getById: (credentialId: Credential["credentialId"]) =>
      Effect.gen(function* () {
        const credentials = yield* Ref.get(stored);
        const credential = credentials.find(
          (storedCredential) => storedCredential.credentialId === credentialId,
        );

        if (credential === undefined) {
          return yield* Effect.fail(CredentialNotFoundError.make());
        }

        return credential;
      }),
    deleteById: (credentialId: Credential["credentialId"]) =>
      Ref.update(stored, (credentials) =>
        credentials.filter((credential) => credential.credentialId !== credentialId),
      ),
    findAllNonDeleted: () => Ref.get(stored),
    insertOAuthState: (state: OAuthState) =>
      Ref.update(states, (oauthStates) => [...oauthStates, state]),
    consumeOAuthState: ({
      state,
      now,
    }: {
      readonly state: Redacted.Redacted<string>;
      readonly now: string;
    }) =>
      Effect.gen(function* () {
        const oauthStates = yield* Ref.get(states);
        const oauthState = oauthStates.find(
          (storedState) => Redacted.value(storedState.state) === Redacted.value(state),
        );

        if (oauthState === undefined || oauthState.expiresAt <= now) {
          return yield* Effect.fail(OAuthStateInvalidError.make());
        }

        yield* Ref.update(states, (storedStates) =>
          storedStates.filter(
            (storedState) => Redacted.value(storedState.state) !== Redacted.value(state),
          ),
        );

        return oauthState;
      }),
  };
}

function makeSecretVault() {
  return {
    encrypt: ({
      purpose,
      plaintext,
    }: {
      readonly credentialId: Credential["credentialId"];
      readonly purpose: string;
      readonly plaintext: Redacted.Redacted<string>;
    }) => Effect.succeed(`encrypted:${purpose}:${Redacted.value(plaintext)}`),
    decrypt: (input: { readonly ciphertext: string; readonly purpose: string }) =>
      Effect.succeed(Redacted.make(input.ciphertext.replace(`encrypted:${input.purpose}:`, ""))),
  };
}

function makeOAuth2Client(
  exchangedCodes?: Ref.Ref<ReadonlyArray<string>>,
  options?: { readonly refreshToken: "include" | "omit" },
) {
  return {
    buildAuthorizationUrl: ({ state }: { readonly state: Redacted.Redacted<string> }) =>
      Effect.succeed(`https://provider.example.com/authorize?state=${Redacted.value(state)}`),
    exchangeAuthorizationCode: ({ code }: { readonly code: string }) =>
      Effect.gen(function* () {
        if (exchangedCodes !== undefined) {
          yield* Ref.update(exchangedCodes, (codes) => [...codes, code]);
        }

        const refreshToken = code === "second-code" ? "second-refresh-token" : "refresh-token";
        const scopes = code === "second-code" ? ["email"] : ["calendar.readonly"];

        return options?.refreshToken === "omit"
          ? {
              accessToken: Redacted.make("access-token"),
              scopes,
            }
          : {
              accessToken: Redacted.make("access-token"),
              refreshToken: Redacted.make(refreshToken),
              scopes,
            };
      }),
    refreshAccessToken: () =>
      Effect.succeed({
        accessToken: Redacted.make("refreshed-access-token"),
        refreshToken: Redacted.make("refreshed-refresh-token"),
        scopes: ["calendar.readonly"],
      }),
  };
}

function makePendingOAuth2Credential(): Credential {
  return {
    credentialId: "cred_0123456789abcdef",
    type: "OAuth2",
    label: "Calendar",
    status: "pending",
    allowedRequests: [{ url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } }],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    oauth2: {
      clientId: "client-id",
      encryptedClientSecret: "encrypted:OAuth2.clientSecret:client-secret",
      authorizationUrl: "https://provider.example.com/authorize",
      tokenUrl: "https://provider.example.com/token",
      scopes: ["calendar.readonly"],
      grantedScopes: [],
    },
  };
}

function makeActiveOAuth2Credential(): Credential {
  const credential = makePendingOAuth2Credential();

  if (credential.type !== "OAuth2") {
    throw new Error("Expected OAuth2 credential");
  }

  return {
    ...credential,
    status: "active",
    oauth2: {
      ...credential.oauth2,
      grantedScopes: ["calendar.readonly"],
      encryptedRefreshToken: "encrypted:OAuth2.refreshToken:refresh-token",
    },
  };
}

function makeOAuthState(state: string, expiresAt: string): OAuthState {
  return {
    state: Redacted.make(state),
    credentialId: "cred_0123456789abcdef",
    codeVerifier: Redacted.make("code-verifier"),
    redirectUri: "https://usher.example.com/oauth2/callback",
    createdAt: "2026-05-27T00:00:00.000Z",
    expiresAt,
  };
}
