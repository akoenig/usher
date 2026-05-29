import { FileSystem } from "@effect/platform";
import type { File } from "@effect/platform/FileSystem";
import type { PlatformError } from "@effect/platform/Error";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { Option } from "effect";
import {
  EncryptionKeyFileMissingError,
  EncryptionKeyFileNotOwnedByProcessUserError,
  EncryptionKeyFileTooPermissiveError,
  EncryptionKeyInvalidFormatError,
} from "../../Domain/Errors/UsherErrors.js";

const Base64UrlPrefix = "base64url:";
const ExpectedKeyBytes = 32;

export type EncryptionKeyFileHandle = {
  readonly stat: () => Promise<{ readonly uid: number; readonly mode: number }>;
  readonly readFile: () => Promise<string>;
  readonly close: () => Promise<void>;
};

export function validateEncryptionKeyFileStat(input: {
  readonly ownerUserId: number;
  readonly mode: number;
  readonly processUserId: number | undefined;
}): Effect.Effect<
  void,
  EncryptionKeyFileNotOwnedByProcessUserError | EncryptionKeyFileTooPermissiveError
> {
  if (input.processUserId !== undefined && input.ownerUserId !== input.processUserId) {
    return Effect.fail(EncryptionKeyFileNotOwnedByProcessUserError.make());
  }

  const mode = input.mode & 0o777;
  if (mode !== 0o400 && mode !== 0o600) {
    return Effect.fail(EncryptionKeyFileTooPermissiveError.make());
  }

  return Effect.void;
}

export function loadEncryptionKeyFile(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const file = yield* fs.open(path, { flag: "r" }).pipe(Effect.mapError(mapOpenError));

    return yield* loadEncryptionKeyFileFromPlatformFile(file, getEffectiveUserId());
  }).pipe(Effect.scoped, Effect.provide(NodeFileSystem.layer));
}

export function loadEncryptionKeyFileFromHandle(
  handle: EncryptionKeyFileHandle,
  processUserId: number | undefined,
) {
  return Effect.gen(function* () {
    const fileStat = yield* Effect.tryPromise({
      try: () => handle.stat(),
      catch: () => EncryptionKeyInvalidFormatError.make(),
    });

    yield* validateEncryptionKeyFileStat({
      ownerUserId: fileStat.uid,
      mode: fileStat.mode,
      processUserId,
    });

    const contents = yield* Effect.tryPromise({
      try: () => handle.readFile(),
      catch: () => EncryptionKeyInvalidFormatError.make(),
    });

    return yield* decodeKeyFileContents(contents);
  }).pipe(Effect.ensuring(closeHandle(handle)));
}

function closeHandle(handle: EncryptionKeyFileHandle) {
  return Effect.ignore(
    Effect.tryPromise({
      try: () => handle.close(),
      catch: () => undefined,
    }),
  );
}

function loadEncryptionKeyFileFromPlatformFile(file: File, processUserId: number | undefined) {
  return Effect.gen(function* () {
    const fileStat = yield* file.stat.pipe(
      Effect.mapError(() => EncryptionKeyInvalidFormatError.make()),
    );
    const ownerUserId = yield* Option.match(fileStat.uid, {
      onNone: () => Effect.fail(EncryptionKeyInvalidFormatError.make()),
      onSome: (uid) => Effect.succeed(uid),
    });

    yield* validateEncryptionKeyFileStat({
      ownerUserId,
      mode: fileStat.mode,
      processUserId,
    });

    const contents = yield* file.readAlloc(fileStat.size).pipe(
      Effect.mapError(() => EncryptionKeyInvalidFormatError.make()),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(EncryptionKeyInvalidFormatError.make()),
          onSome: (bytes) => Effect.succeed(new TextDecoder().decode(bytes)),
        }),
      ),
    );

    return yield* decodeKeyFileContents(contents);
  });
}

export function decodeEncryptionKeyContents(
  contents: string,
): Effect.Effect<Uint8Array, EncryptionKeyInvalidFormatError> {
  const line = readSingleLine(contents);
  if (line === undefined || !line.startsWith(Base64UrlPrefix)) {
    return Effect.fail(EncryptionKeyInvalidFormatError.make());
  }

  const value = line.slice(Base64UrlPrefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return Effect.fail(EncryptionKeyInvalidFormatError.make());
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== ExpectedKeyBytes) {
    return Effect.fail(EncryptionKeyInvalidFormatError.make());
  }

  return Effect.succeed(Uint8Array.from(decoded));
}

const decodeKeyFileContents = decodeEncryptionKeyContents;

function readSingleLine(contents: string) {
  if (contents.endsWith("\n")) {
    const line = contents.slice(0, -1);
    return line.includes("\n") || line.endsWith("\r") ? undefined : line;
  }

  return contents.includes("\n") || contents.endsWith("\r") ? undefined : contents;
}

function mapOpenError(error: PlatformError) {
  if (isMissingFileError(error)) {
    return EncryptionKeyFileMissingError.make();
  }

  return EncryptionKeyInvalidFormatError.make();
}

function isMissingFileError(error: PlatformError) {
  return "reason" in error && error.reason === "NotFound";
}

function getEffectiveUserId() {
  if (typeof process.geteuid !== "function") {
    return undefined;
  }

  return process.geteuid();
}
