import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer, Redacted, Ref } from "effect";
import type { Credential } from "../../Domain/Credentials/Credential.js";
import type { OAuthState } from "../Ports/CredentialRepository.js";
import {
  CredentialNotFoundError,
  InvalidCredentialStatusError,
  OAuthStateInvalidError,
  InvalidTargetUrlError,
  OverlappingAllowedRequestError,
} from "../../Domain/Errors/UsherErrors.js";
import { CredentialRepository } from "../Ports/CredentialRepository.js";
import { SecretVault } from "../Ports/SecretVault.js";
import { CredentialService, CredentialServiceLive } from "./CredentialService.js";

describe("CredentialService", () => {
  it.effect("creates a bearer token credential with redacted token material", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* CredentialService;

          return yield* service.create({
            type: "BearerToken",
            label: "Internal API",
            allowedRequests: [
              { url: { origin: "https://api.internal.example.com", pathPrefix: "/v1/" } },
            ],
            bearerToken: { token: Redacted.make("super-secret-token") },
          });
        }),
        Layer.provide(
          CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
          Layer.mergeAll(
            Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
            Layer.succeed(SecretVault, makeSecretVault()),
          ),
        ),
      );

      if (result.type === "BearerToken") {
        assert.strictEqual(result.status, "active");
        assert.strictEqual(result.tokenPreview, "********");
      } else {
        assert.fail("Expected BearerToken credential");
      }

      assert.assertFalse(JSON.stringify(result).includes("super-secret-token"));
    }),
  );

  it.effect("creates an oauth2 credential with redacted secret material and login url", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* CredentialService;

          return yield* service.create({
            type: "OAuth2",
            label: "Calendar",
            allowedRequests: [
              { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
            ],
            oauth2: {
              clientId: "client-id",
              clientSecret: Redacted.make("client-secret-value"),
              authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
              tokenUrl: "https://oauth2.googleapis.com/token",
              scopes: ["calendar.readonly"],
            },
          });
        }),
        Layer.provide(
          CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
          Layer.mergeAll(
            Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
            Layer.succeed(SecretVault, makeSecretVault()),
          ),
        ),
      );

      if (result.type === "OAuth2") {
        assert.strictEqual(result.status, "pending");
        assert.strictEqual(result.clientSecretPreview, "********");
        assert.deepStrictEqual(result.grantedScopes, []);
        assert.assertTrue(
          result.loginUrl.endsWith(`/credentials/${result.credentialId}/oauth2/login`),
        );
      } else {
        assert.fail("Expected OAuth2 credential");
      }

      assert.assertFalse(JSON.stringify(result).includes("client-secret-value"));
    }),
  );

  it.effect("preserves oauth2 token auth method when creating a credential", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);

      yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* CredentialService;

          return yield* service.create({
            type: "OAuth2",
            label: "X API",
            allowedRequests: [{ url: { origin: "https://api.x.com", pathPrefix: "/2/" } }],
            oauth2: {
              clientId: "client-id",
              clientSecret: Redacted.make("client-secret-value"),
              authorizationUrl: "https://x.com/i/oauth2/authorize",
              tokenUrl: "https://api.x.com/2/oauth2/token",
              scopes: ["tweet.read", "users.read", "offline.access"],
              tokenAuthMethod: "client_secret_basic",
            },
          });
        }),
        Layer.provide(
          CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
          Layer.mergeAll(
            Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
            Layer.succeed(SecretVault, makeSecretVault()),
          ),
        ),
      );

      const credentials = yield* Ref.get(stored);
      const credential = credentials[0];

      if (credential === undefined || credential.type !== "OAuth2") {
        return assert.fail("Expected stored OAuth2 credential");
      }

      assert.strictEqual(credential.oauth2.tokenAuthMethod, "client_secret_basic");
    }),
  );

  it.effect("rejects overlapping allowed requests", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);
      const program = Effect.gen(function* () {
        const service = yield* CredentialService;

        yield* service.create({
          type: "BearerToken",
          label: "First API",
          allowedRequests: [
            { url: { origin: "https://api.internal.example.com", pathPrefix: "/v1/" } },
          ],
          bearerToken: { token: Redacted.make("first-token") },
        });

        return yield* service.create({
          type: "BearerToken",
          label: "Second API",
          allowedRequests: [
            { url: { origin: "https://api.internal.example.com", pathPrefix: "/v1/users/" } },
          ],
          bearerToken: { token: Redacted.make("second-token") },
        });
      });

      const error = yield* Effect.flip(
        Effect.provide(
          program,
          Layer.provide(
            CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
            Layer.mergeAll(
              Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
              Layer.succeed(SecretVault, makeSecretVault()),
            ),
          ),
        ),
      );

      assert.assertInstanceOf(error, OverlappingAllowedRequestError);
    }),
  );

  it.effect("rejects invalid allowed requests with semantic errors", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);
      const program = Effect.gen(function* () {
        const service = yield* CredentialService;

        return yield* service.create({
          type: "BearerToken",
          label: "Internal API",
          allowedRequests: [
            { url: { origin: "http://api.internal.example.com", pathPrefix: "/v1/" } },
          ],
          bearerToken: { token: Redacted.make("super-secret-token") },
        });
      });

      const error = yield* Effect.flip(
        Effect.provide(
          program,
          Layer.provide(
            CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
            Layer.mergeAll(
              Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
              Layer.succeed(SecretVault, makeSecretVault()),
            ),
          ),
        ),
      );

      assert.assertInstanceOf(error, InvalidTargetUrlError);
    }),
  );

  it.effect("delete removes credential from list and non-deleted lookup", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);
      const repositoryLayer = Layer.succeed(CredentialRepository, makeCredentialRepository(stored));
      const result = yield* Effect.provide(
        Effect.gen(function* () {
          const service = yield* CredentialService;
          const repository = yield* CredentialRepository;
          const credential = yield* service.create({
            type: "BearerToken",
            label: "Internal API",
            allowedRequests: [
              { url: { origin: "https://api.internal.example.com", pathPrefix: "/v1/" } },
            ],
            bearerToken: { token: Redacted.make("super-secret-token") },
          });

          yield* service.deleteById(credential.credentialId);

          return {
            listed: yield* service.list(),
            nonDeleted: yield* repository.findAllNonDeleted(),
          };
        }),
        Layer.mergeAll(
          Layer.provide(
            CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
            Layer.mergeAll(repositoryLayer, Layer.succeed(SecretVault, makeSecretVault())),
          ),
          repositoryLayer,
        ),
      );

      assert.deepStrictEqual(result.listed, []);
      assert.deepStrictEqual(result.nonDeleted, []);
    }),
  );

  it.effect("delete fails for missing credentials", () =>
    Effect.gen(function* () {
      const stored = yield* Ref.make<ReadonlyArray<Credential>>([]);
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* CredentialService;

            return yield* service.deleteById("cred_0123456789abcdef");
          }),
          Layer.provide(
            CredentialServiceLive({ baseUrl: "https://usher.example.com" }),
            Layer.mergeAll(
              Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
              Layer.succeed(SecretVault, makeSecretVault()),
            ),
          ),
        ),
      );

      assert.assertInstanceOf(error, CredentialNotFoundError);
    }),
  );
});

function makeCredentialRepository(stored: Ref.Ref<ReadonlyArray<Credential>>) {
  return {
    insert: (credential: Credential) =>
      Ref.update(stored, (credentials) => [...credentials, credential]),
    update: (credential: Credential) =>
      Ref.update(stored, (credentials) =>
        credentials.map((storedCredential) =>
          storedCredential.credentialId === credential.credentialId ? credential : storedCredential,
        ),
      ),
    activateOAuth2CredentialFromCallback: (credential: Credential) =>
      Effect.gen(function* () {
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
      Effect.gen(function* () {
        const credentials = yield* Ref.get(stored);
        const credential = credentials.find(
          (storedCredential) => storedCredential.credentialId === credentialId,
        );

        if (credential === undefined) {
          return yield* Effect.fail(CredentialNotFoundError.make());
        }

        yield* Ref.update(stored, (storedCredentials) =>
          storedCredentials.filter(
            (storedCredential) => storedCredential.credentialId !== credentialId,
          ),
        );
      }),
    findAllNonDeleted: () => Ref.get(stored),
    insertOAuthState: (_state: OAuthState) => Effect.void,
    consumeOAuthState: (_input: {
      readonly state: Redacted.Redacted<string>;
      readonly now: string;
    }) => Effect.fail(OAuthStateInvalidError.make()),
  };
}

function makeSecretVault() {
  return {
    encrypt: (input: {
      readonly credentialId: Credential["credentialId"];
      readonly purpose: string;
      readonly plaintext: Redacted.Redacted<string>;
    }) => Effect.succeed(`encrypted:${input.purpose}:${Redacted.value(input.plaintext)}`),
    decrypt: (input: { readonly ciphertext: string; readonly purpose: string }) =>
      Effect.succeed(Redacted.make(input.ciphertext.replace(`encrypted:${input.purpose}:`, ""))),
  };
}
