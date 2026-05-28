import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Either, Schema } from "effect";
import {
  CallerIpNotAllowedError,
  CredentialNotFoundError,
  EncryptionKeyFileMissingError,
  EncryptionKeyFileNotOwnedByProcessUserError,
  EncryptionKeyFileTooPermissiveError,
  EncryptionKeyInvalidFormatError,
  ErrorResponseBody,
  InvalidCredentialStatusError,
  InvalidCredentialTypeError,
  InvalidTargetUrlError,
  MissingUserAgentError,
  MissingUrlError,
  NoMatchingCredentialError,
  OAuthStateInvalidError,
  OAuthTokenExchangeFailedError,
  OverlappingAllowedRequestError,
  ReservedHeaderError,
  semanticErrorMakers,
  toErrorResponseBody,
  UpstreamRequestFailedError,
} from "./UsherErrors.js";

const specificErrorModules = [
  {
    error: CallerIpNotAllowedError,
    importError: () =>
      import("./CallerIpNotAllowedError.js").then((module) => module.CallerIpNotAllowedError),
  },
  {
    error: MissingUrlError,
    importError: () => import("./MissingUrlError.js").then((module) => module.MissingUrlError),
  },
  {
    error: InvalidTargetUrlError,
    importError: () =>
      import("./InvalidTargetUrlError.js").then((module) => module.InvalidTargetUrlError),
  },
  {
    error: MissingUserAgentError,
    importError: () =>
      import("./MissingUserAgentError.js").then((module) => module.MissingUserAgentError),
  },
  {
    error: ReservedHeaderError,
    importError: () =>
      import("./ReservedHeaderError.js").then((module) => module.ReservedHeaderError),
  },
  {
    error: NoMatchingCredentialError,
    importError: () =>
      import("./NoMatchingCredentialError.js").then((module) => module.NoMatchingCredentialError),
  },
  {
    error: OverlappingAllowedRequestError,
    importError: () =>
      import("./OverlappingAllowedRequestError.js").then(
        (module) => module.OverlappingAllowedRequestError,
      ),
  },
  {
    error: CredentialNotFoundError,
    importError: () =>
      import("./CredentialNotFoundError.js").then((module) => module.CredentialNotFoundError),
  },
  {
    error: InvalidCredentialTypeError,
    importError: () =>
      import("./InvalidCredentialTypeError.js").then((module) => module.InvalidCredentialTypeError),
  },
  {
    error: InvalidCredentialStatusError,
    importError: () =>
      import("./InvalidCredentialStatusError.js").then(
        (module) => module.InvalidCredentialStatusError,
      ),
  },
  {
    error: OAuthStateInvalidError,
    importError: () =>
      import("./OAuthStateInvalidError.js").then((module) => module.OAuthStateInvalidError),
  },
  {
    error: OAuthTokenExchangeFailedError,
    importError: () =>
      import("./OAuthTokenExchangeFailedError.js").then(
        (module) => module.OAuthTokenExchangeFailedError,
      ),
  },
  {
    error: UpstreamRequestFailedError,
    importError: () =>
      import("./UpstreamRequestFailedError.js").then((module) => module.UpstreamRequestFailedError),
  },
  {
    error: EncryptionKeyFileMissingError,
    importError: () =>
      import("./EncryptionKeyFileMissingError.js").then(
        (module) => module.EncryptionKeyFileMissingError,
      ),
  },
  {
    error: EncryptionKeyFileNotOwnedByProcessUserError,
    importError: () =>
      import("./EncryptionKeyFileNotOwnedByProcessUserError.js").then(
        (module) => module.EncryptionKeyFileNotOwnedByProcessUserError,
      ),
  },
  {
    error: EncryptionKeyFileTooPermissiveError,
    importError: () =>
      import("./EncryptionKeyFileTooPermissiveError.js").then(
        (module) => module.EncryptionKeyFileTooPermissiveError,
      ),
  },
  {
    error: EncryptionKeyInvalidFormatError,
    importError: () =>
      import("./EncryptionKeyInvalidFormatError.js").then(
        (module) => module.EncryptionKeyInvalidFormatError,
      ),
  },
];

describe("UsherErrors", () => {
  it("converts NoMatchingCredentialError to an error response body", () => {
    const error = NoMatchingCredentialError.make();
    const body = toErrorResponseBody(error);

    assert.deepStrictEqual(body, {
      error: {
        code: "NoMatchingCredentialError",
        message: "No matching credential found for the requested URL",
      },
    });
  });

  it("creates MissingUserAgentError with its semantic code", () => {
    const error = MissingUserAgentError.make();

    assert.strictEqual(error.code, "MissingUserAgentError");
  });

  it("creates every semantic error with a code ending in Error", () => {
    for (const makeError of semanticErrorMakers) {
      const error = makeError();

      assert.assertTrue(error.code.endsWith("Error"));
    }
  });

  it("decodes an error response body", () => {
    const decoded = Schema.decodeUnknownEither(ErrorResponseBody)({
      error: {
        code: "NoMatchingCredentialError",
        message: "No matching credential found for the requested URL",
      },
    });

    assert.assertTrue(Either.isRight(decoded));
  });

  it("exports each semantic error from its own file", async () => {
    for (const specificErrorModule of specificErrorModules) {
      const imported = await specificErrorModule.importError();

      assert.strictEqual(imported, specificErrorModule.error);
    }
  });
});
