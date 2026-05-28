import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer } from "effect";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecretVault } from "../../Application/Ports/SecretVault.js";
import type { CredentialId } from "../../Domain/Credentials/Credential.js";
import {
  EncryptionKeyFileMissingError,
  EncryptionKeyInvalidFormatError,
} from "../../Domain/Errors/UsherErrors.js";
import { makeNodeSecretVault, NodeSecretVaultLive } from "./NodeSecretVault.js";

describe("NodeSecretVault", () => {
  it.effect("encrypts and decrypts a secret value", () =>
    Effect.gen(function* () {
      const vault = makeNodeSecretVault(masterKey());
      const ciphertext = yield* vault.encrypt({
        credentialId: credentialId(),
        purpose: "bearer-token",
        plaintext: "super-secret-token",
      });

      const plaintext = yield* vault.decrypt({
        credentialId: credentialId(),
        purpose: "bearer-token",
        ciphertext,
      });

      assert.strictEqual(plaintext, "super-secret-token");
      assert.assertFalse(ciphertext.includes("super-secret-token"));
    }),
  );

  it.effect("fails decryption when the credential id differs", () =>
    Effect.gen(function* () {
      const vault = makeNodeSecretVault(masterKey());
      const ciphertext = yield* vault.encrypt({
        credentialId: credentialId(),
        purpose: "bearer-token",
        plaintext: "super-secret-token",
      });

      const error = yield* Effect.flip(
        vault.decrypt({
          credentialId: otherCredentialId(),
          purpose: "bearer-token",
          ciphertext,
        }),
      );

      assert.assertInstanceOf(error, EncryptionKeyInvalidFormatError);
    }),
  );

  it.effect("fails decryption when the purpose differs", () =>
    Effect.gen(function* () {
      const vault = makeNodeSecretVault(masterKey());
      const ciphertext = yield* vault.encrypt({
        credentialId: credentialId(),
        purpose: "bearer-token",
        plaintext: "super-secret-token",
      });

      const error = yield* Effect.flip(
        vault.decrypt({
          credentialId: credentialId(),
          purpose: "oauth-client-secret",
          ciphertext,
        }),
      );

      assert.assertInstanceOf(error, EncryptionKeyInvalidFormatError);
    }),
  );

  it.effect("uses a fresh nonce for each encrypted value", () =>
    Effect.gen(function* () {
      const vault = makeNodeSecretVault(masterKey());

      const first = yield* vault.encrypt({
        credentialId: credentialId(),
        purpose: "bearer-token",
        plaintext: "super-secret-token",
      });
      const second = yield* vault.encrypt({
        credentialId: credentialId(),
        purpose: "bearer-token",
        plaintext: "super-secret-token",
      });

      assert.assertTrue(first !== second);
    }),
  );

  it.effect("provides the SecretVault application port", () =>
    Effect.gen(function* () {
      const directory = yield* makeTempDirectory();
      const keyPath = join(directory, "usher.key");
      yield* writeKeyFile(keyPath, validKeyFileContents(), 0o600);
      const ciphertext = yield* Effect.provide(
        Effect.gen(function* () {
          const vault = yield* SecretVault;

          return yield* vault.encrypt({
            credentialId: credentialId(),
            purpose: "bearer-token",
            plaintext: "super-secret-token",
          });
        }),
        NodeSecretVaultLive(keyPath),
      );

      const plaintext = yield* Effect.provide(
        Effect.gen(function* () {
          const vault = yield* SecretVault;

          return yield* vault.decrypt({
            credentialId: credentialId(),
            purpose: "bearer-token",
            ciphertext,
          });
        }),
        Layer.provide(NodeSecretVaultLive(keyPath), Layer.empty),
      );

      assert.strictEqual(plaintext, "super-secret-token");
      yield* removeTempDirectory(directory);
    }),
  );

  it.effect("fails the SecretVault layer when the key file is missing", () =>
    Effect.gen(function* () {
      const directory = yield* makeTempDirectory();
      const missingPath = join(directory, "missing.key");
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const vault = yield* SecretVault;

            return yield* vault.encrypt({
              credentialId: credentialId(),
              purpose: "bearer-token",
              plaintext: "super-secret-token",
            });
          }),
          NodeSecretVaultLive(missingPath),
        ),
      );

      assert.assertInstanceOf(error, EncryptionKeyFileMissingError);
      yield* removeTempDirectory(directory);
    }),
  );
});

function masterKey() {
  return Uint8Array.from({ length: 32 }, (_value, index) => index);
}

function credentialId(): CredentialId {
  return "cred_0123456789abcdef";
}

function otherCredentialId(): CredentialId {
  return "cred_abcdef0123456789";
}

function makeTempDirectory() {
  return Effect.promise(() => mkdtemp(join(tmpdir(), "usher-secret-vault-")));
}

function removeTempDirectory(directory: string) {
  return Effect.promise(() => rm(directory, { recursive: true, force: true }));
}

function writeKeyFile(path: string, contents: string, mode: number) {
  return Effect.promise(async () => {
    await writeFile(path, contents, { mode });
    await chmod(path, mode);
  });
}

function validKeyFileContents() {
  return `base64url:${Buffer.from(masterKey()).toString("base64url")}\n`;
}
