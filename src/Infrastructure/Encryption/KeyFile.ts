import { Effect } from "effect"
import { readFile, stat } from "node:fs/promises"
import {
  EncryptionKeyFileMissingError,
  EncryptionKeyFileNotOwnedByProcessUserError,
  EncryptionKeyFileTooPermissiveError,
  EncryptionKeyInvalidFormatError
} from "../../Domain/Errors/UsherErrors.js"

const Base64UrlPrefix = "base64url:"
const ExpectedKeyBytes = 32

export function loadEncryptionKeyFile(path: string) {
  return Effect.gen(function*() {
    const fileStat = yield* Effect.tryPromise({
      try: () => stat(path),
      catch: (error) => isMissingFileError(error)
        ? EncryptionKeyFileMissingError.make()
        : EncryptionKeyInvalidFormatError.make()
    })

    const processUserId = getEffectiveUserId()
    if (processUserId !== undefined && fileStat.uid !== processUserId) {
      return yield* Effect.fail(EncryptionKeyFileNotOwnedByProcessUserError.make())
    }

    const mode = fileStat.mode & 0o777
    if (mode !== 0o400 && mode !== 0o600) {
      return yield* Effect.fail(EncryptionKeyFileTooPermissiveError.make())
    }

    const contents = yield* Effect.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: () => EncryptionKeyInvalidFormatError.make()
    })

    return yield* decodeKeyFileContents(contents)
  })
}

function decodeKeyFileContents(contents: string) {
  const line = readSingleLine(contents)
  if (line === undefined || !line.startsWith(Base64UrlPrefix)) {
    return Effect.fail(EncryptionKeyInvalidFormatError.make())
  }

  const value = line.slice(Base64UrlPrefix.length)
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return Effect.fail(EncryptionKeyInvalidFormatError.make())
  }

  const decoded = Buffer.from(value, "base64url")
  if (decoded.byteLength !== ExpectedKeyBytes) {
    return Effect.fail(EncryptionKeyInvalidFormatError.make())
  }

  return Effect.succeed(Uint8Array.from(decoded))
}

function readSingleLine(contents: string) {
  if (contents.endsWith("\n")) {
    const line = contents.slice(0, -1)
    return line.includes("\n") || line.endsWith("\r") ? undefined : line
  }

  return contents.includes("\n") || contents.endsWith("\r") ? undefined : contents
}

function isMissingFileError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false
  }

  return error.code === "ENOENT"
}

function getEffectiveUserId() {
  if (typeof process.geteuid !== "function") {
    return undefined
  }

  return process.geteuid()
}
