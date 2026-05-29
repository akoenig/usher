import { Effect, Layer, Redacted, Schema } from "effect";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { SecretVault } from "../../Application/Ports/SecretVault.js";
import type { CredentialId } from "../../Domain/Credentials/Credential.js";
import {
  EncryptionKeyInvalidFormatError,
  type SemanticError,
} from "../../Domain/Errors/UsherErrors.js";
import { loadEncryptionKeyFile } from "./KeyFile.js";

const EncryptionVersion = 1;
const Algorithm = "aes-256-gcm";
const NonceBytes = 12;
const AuthenticationTagBytes = 16;

const StoredCiphertext = Schema.Struct({
  version: Schema.Literal(EncryptionVersion),
  algorithm: Schema.Literal(Algorithm),
  nonce: Schema.String,
  ciphertext: Schema.String,
});
type StoredCiphertext = Schema.Schema.Type<typeof StoredCiphertext>;

export function NodeSecretVaultLive(keyFilePath: string) {
  return Layer.effect(
    SecretVault,
    Effect.map(loadEncryptionKeyFile(keyFilePath), (masterKey) => makeNodeSecretVault(masterKey)),
  );
}

export function NodeSecretVaultLiveFromKey(masterKey: Uint8Array) {
  return Layer.succeed(SecretVault, makeNodeSecretVault(masterKey));
}

export function makeNodeSecretVault(masterKey: Uint8Array) {
  return {
    encrypt: (input: {
      readonly credentialId: CredentialId;
      readonly purpose: string;
      readonly plaintext: Redacted.Redacted<string>;
    }) => encrypt(masterKey, input),
    decrypt: (input: {
      readonly credentialId: CredentialId;
      readonly purpose: string;
      readonly ciphertext: string;
    }) => decrypt(masterKey, input),
  };
}

function encrypt(
  masterKey: Uint8Array,
  input: {
    readonly credentialId: CredentialId;
    readonly purpose: string;
    readonly plaintext: Redacted.Redacted<string>;
  },
): Effect.Effect<string, SemanticError> {
  return Effect.try({
    try: () => {
      const nonce = randomBytes(NonceBytes);
      const key = deriveKey(masterKey, input.credentialId, input.purpose);
      const cipher = createCipheriv(Algorithm, key, nonce, {
        authTagLength: AuthenticationTagBytes,
      });
      cipher.setAAD(associatedData(input.credentialId, input.purpose));
      const encrypted = Buffer.concat([
        cipher.update(Redacted.value(input.plaintext), "utf8"),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      const stored: StoredCiphertext = {
        version: EncryptionVersion,
        algorithm: Algorithm,
        nonce: nonce.toString("base64url"),
        ciphertext: encrypted.toString("base64url"),
      };

      return JSON.stringify(stored);
    },
    catch: () => EncryptionKeyInvalidFormatError.make(),
  });
}

function decrypt(
  masterKey: Uint8Array,
  input: {
    readonly credentialId: CredentialId;
    readonly purpose: string;
    readonly ciphertext: string;
  },
): Effect.Effect<Redacted.Redacted<string>, SemanticError> {
  return Effect.gen(function* () {
    const parsed = yield* parseJson(input.ciphertext);
    const stored = yield* Schema.decodeUnknown(StoredCiphertext)(parsed).pipe(
      Effect.mapError(() => EncryptionKeyInvalidFormatError.make()),
    );

    return yield* Effect.try({
      try: () => {
        const encrypted = Buffer.from(stored.ciphertext, "base64url");
        if (encrypted.byteLength <= AuthenticationTagBytes) {
          throw new Error("Ciphertext is missing authentication tag");
        }

        const nonce = Buffer.from(stored.nonce, "base64url");
        const tagStart = encrypted.byteLength - AuthenticationTagBytes;
        const body = encrypted.subarray(0, tagStart);
        const tag = encrypted.subarray(tagStart);
        const key = deriveKey(masterKey, input.credentialId, input.purpose);
        const decipher = createDecipheriv(Algorithm, key, nonce, {
          authTagLength: AuthenticationTagBytes,
        });
        decipher.setAAD(associatedData(input.credentialId, input.purpose));
        decipher.setAuthTag(tag);

        return Redacted.make(
          Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"),
        );
      },
      catch: () => EncryptionKeyInvalidFormatError.make(),
    });
  });
}

function parseJson(value: string) {
  return Effect.try({
    try: () => JSON.parse(value),
    catch: () => EncryptionKeyInvalidFormatError.make(),
  });
}

function deriveKey(masterKey: Uint8Array, credentialId: CredentialId, purpose: string) {
  const info = `usher:v${EncryptionVersion}:credential:${credentialId}:${purpose}`;
  return Buffer.from(hkdfSync("sha256", masterKey, credentialId, info, 32));
}

function associatedData(credentialId: CredentialId, purpose: string) {
  return Buffer.from(`usher:v${EncryptionVersion}:credential:${credentialId}:${purpose}`, "utf8");
}
