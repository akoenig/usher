import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer, Ref, Schema } from "effect";
import { CallService } from "../../Application/Services/CallService.js";
import {
  CredentialService,
  type RedactedCredential,
} from "../../Application/Services/CredentialService.js";
import { OAuth2Service } from "../../Application/Services/OAuth2Service.js";
import { type CreateCredentialInput } from "../../Domain/Credentials/Credential.js";
import { MissingUrlError } from "../../Domain/Errors/UsherErrors.js";
import { makeHttpApp } from "../Http/HttpServer.js";
import {
  AdminApiClient,
  AdminApiClientLive,
  AdminApiError,
  adminCredentialPath,
  adminCredentialsPath,
  makeAdminApiClient,
} from "./AdminApiClient.js";

describe("AdminApiClient", () => {
  it("builds credential collection paths", () => {
    assert.strictEqual(adminCredentialsPath(), "/credentials");
  });

  it("builds credential member paths", () => {
    assert.strictEqual(
      adminCredentialPath("cred_0123456789abcdef"),
      "/credentials/cred_0123456789abcdef",
    );
  });

  it.effect("list decodes a JSON array from GET /credentials", () =>
    Effect.gen(function* () {
      const createdInputs = yield* Ref.make<ReadonlyArray<CreateCredentialInput>>([]);
      const deletedIds = yield* Ref.make<ReadonlyArray<string>>([]);

      const credentials = yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const client = yield* AdminApiClient;

        return yield* client.list();
      }).pipe(Effect.provide(testLayer(createdInputs, deletedIds, "success")), Effect.scoped);

      assert.deepStrictEqual(credentials, [redactedCredential]);
    }),
  );

  it.effect("create sends JSON body to POST /credentials and decodes returned credential", () =>
    Effect.gen(function* () {
      const createdInputs = yield* Ref.make<ReadonlyArray<CreateCredentialInput>>([]);
      const deletedIds = yield* Ref.make<ReadonlyArray<string>>([]);

      const credential = yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const client = yield* AdminApiClient;

        return yield* client.create(createCredentialInput);
      }).pipe(Effect.provide(testLayer(createdInputs, deletedIds, "success")), Effect.scoped);
      const inputs = yield* Ref.get(createdInputs);

      assert.deepStrictEqual(credential, redactedCredential);
      assert.deepStrictEqual(inputs, [createCredentialInput]);
    }),
  );

  it.effect("non-2xx error body fails with AdminApiError preserving code and message", () =>
    Effect.gen(function* () {
      const createdInputs = yield* Ref.make<ReadonlyArray<CreateCredentialInput>>([]);
      const deletedIds = yield* Ref.make<ReadonlyArray<string>>([]);

      const error = yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const client = yield* AdminApiClient;

        return yield* client.list().pipe(Effect.flip);
      }).pipe(Effect.provide(testLayer(createdInputs, deletedIds, "error")), Effect.scoped);

      if (!Schema.is(AdminApiError)(error)) {
        return yield* Effect.die("expected AdminApiError");
      }

      assert.strictEqual(error.code, "MissingUrlError");
      assert.strictEqual(error.message, "Missing target URL");
    }),
  );

  it.effect("delete treats 204 as success and consumes the scoped response", () =>
    Effect.gen(function* () {
      const createdInputs = yield* Ref.make<ReadonlyArray<CreateCredentialInput>>([]);
      const deletedIds = yield* Ref.make<ReadonlyArray<string>>([]);

      yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const client = yield* AdminApiClient;

        yield* client.deleteById("cred_0123456789abcdef");
      }).pipe(Effect.provide(testLayer(createdInputs, deletedIds, "success")), Effect.scoped);
      const ids = yield* Ref.get(deletedIds);

      assert.deepStrictEqual(ids, ["cred_0123456789abcdef"]);
    }),
  );

  it.effect("deleteById drains successful no-body responses", () =>
    Effect.gen(function* () {
      const drained = yield* Ref.make(false);
      const client = makeAdminApiClient(
        "http://admin.example.test",
        () => Effect.die("unused"),
        () =>
          Effect.succeed({
            status: 204,
            json: Effect.die("unused"),
            arrayBuffer: Ref.set(drained, true).pipe(Effect.as(new ArrayBuffer(0))),
          }),
      );

      yield* Effect.gen(function* () {
        const adminApiClient = yield* AdminApiClient;

        yield* adminApiClient.deleteById("cred_0123456789abcdef");
      }).pipe(Effect.provideService(AdminApiClient, client));
      const wasDrained = yield* Ref.get(drained);

      assert.strictEqual(wasDrained, true);
    }),
  );
});

const redactedCredential: RedactedCredential = {
  credentialId: "cred_0123456789abcdef",
  type: "BearerToken",
  label: "Production API",
  status: "active",
  allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1" } }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tokenPreview: "********",
};

const createCredentialInput: CreateCredentialInput = {
  type: "BearerToken",
  label: "Production API",
  allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1" } }],
  bearerToken: { token: "secret-token" },
};

function testLayer(
  createdInputs: Ref.Ref<ReadonlyArray<CreateCredentialInput>>,
  deletedIds: Ref.Ref<ReadonlyArray<string>>,
  mode: "success" | "error",
) {
  return Layer.mergeAll(
    Layer.succeed(CallService, {
      call: () => Effect.die("unused"),
      execute: () => Effect.die("unused"),
    }),
    Layer.succeed(CredentialService, {
      create: (input) =>
        Ref.update(createdInputs, (existing) => [...existing, input]).pipe(
          Effect.as(redactedCredential),
        ),
      list: () =>
        mode === "success"
          ? Effect.succeed([redactedCredential])
          : Effect.fail(MissingUrlError.make()),
      getById: () => Effect.succeed(redactedCredential),
      deleteById: (credentialId) =>
        Ref.update(deletedIds, (existing) => [...existing, credentialId]),
    }),
    Layer.succeed(OAuth2Service, {
      buildLoginUrl: () => Effect.die("unused"),
      handleCallback: () => Effect.die("unused"),
    }),
    Layer.provide(AdminApiClientLive(""), NodeHttpServer.layerTest),
    NodeHttpServer.layerTest,
  );
}
