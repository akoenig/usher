import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Either } from "effect"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  EncryptionKeyFileMissingError,
  EncryptionKeyFileNotOwnedByProcessUserError,
  EncryptionKeyFileTooPermissiveError,
  EncryptionKeyInvalidFormatError
} from "../../Domain/Errors/UsherErrors.js"
import { loadEncryptionKeyFile, validateEncryptionKeyFileStat } from "./KeyFile.js"

describe("KeyFile", () => {
  it.effect("fails when the key file is missing", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDirectory()
      const missingPath = join(directory, "missing.key")

      const error = yield* Effect.flip(loadEncryptionKeyFile(missingPath))

      assert.assertInstanceOf(error, EncryptionKeyFileMissingError)
      yield* removeTempDirectory(directory)
    }))

  it.effect("fails when the key file grants group or other access", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDirectory()
      const keyPath = join(directory, "usher.key")
      yield* writeKeyFile(keyPath, validKeyFileContents(), 0o644)

      const error = yield* Effect.flip(loadEncryptionKeyFile(keyPath))

      assert.assertInstanceOf(error, EncryptionKeyFileTooPermissiveError)
      yield* removeTempDirectory(directory)
    }))

  it.effect("fails when the key file owner differs from the process user", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(validateEncryptionKeyFileStat({
        ownerUserId: 1001,
        mode: 0o600,
        processUserId: 1002
      }))

      assert.assertTrue(Either.isLeft(result))
      if (Either.isLeft(result)) {
        assert.assertInstanceOf(result.left, EncryptionKeyFileNotOwnedByProcessUserError)
      }
    }))

  it.effect("fails when the key file prefix is invalid", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDirectory()
      const keyPath = join(directory, "usher.key")
      yield* writeKeyFile(keyPath, "base64:" + validKeyValue() + "\n", 0o600)

      const error = yield* Effect.flip(loadEncryptionKeyFile(keyPath))

      assert.assertInstanceOf(error, EncryptionKeyInvalidFormatError)
      yield* removeTempDirectory(directory)
    }))

  it.effect("fails when the decoded key is not 32 bytes", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDirectory()
      const keyPath = join(directory, "usher.key")
      const shortKey = Buffer.from(Uint8Array.from([1, 2, 3])).toString("base64url")
      yield* writeKeyFile(keyPath, `base64url:${shortKey}\n`, 0o600)

      const error = yield* Effect.flip(loadEncryptionKeyFile(keyPath))

      assert.assertInstanceOf(error, EncryptionKeyInvalidFormatError)
      yield* removeTempDirectory(directory)
    }))

  it.effect("loads a current-user-owned valid 0400 key file", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDirectory()
      const keyPath = join(directory, "usher.key")
      yield* writeKeyFile(keyPath, validKeyFileContents(), 0o400)

      const key = yield* loadEncryptionKeyFile(keyPath)

      assert.deepStrictEqual(Array.from(key), Array.from(validKeyBytes()))
      yield* removeTempDirectory(directory)
    }))

  it.effect("loads a current-user-owned valid 0600 key file", () =>
    Effect.gen(function*() {
      const directory = yield* makeTempDirectory()
      const keyPath = join(directory, "usher.key")
      yield* writeKeyFile(keyPath, validKeyFileContents(), 0o600)

      const key = yield* loadEncryptionKeyFile(keyPath)

      assert.deepStrictEqual(Array.from(key), Array.from(validKeyBytes()))
      yield* removeTempDirectory(directory)
    }))
})

function makeTempDirectory() {
  return Effect.promise(() => mkdtemp(join(tmpdir(), "usher-key-file-")))
}

function removeTempDirectory(directory: string) {
  return Effect.promise(() => rm(directory, { recursive: true, force: true }))
}

function writeKeyFile(path: string, contents: string, mode: number) {
  return Effect.promise(async () => {
    await writeFile(path, contents, { mode })
    await chmod(path, mode)
  })
}

function validKeyBytes() {
  return Uint8Array.from({ length: 32 }, (_value, index) => index)
}

function validKeyValue() {
  return Buffer.from(validKeyBytes()).toString("base64url")
}

function validKeyFileContents() {
  return `base64url:${validKeyValue()}\n`
}
