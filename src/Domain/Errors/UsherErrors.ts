import { Data, Schema } from "effect";

export { CallerIpNotAllowedError } from "./CallerIpNotAllowedError.js";
export { CredentialNotFoundError } from "./CredentialNotFoundError.js";
export { EncryptionKeyFileMissingError } from "./EncryptionKeyFileMissingError.js";
export { EncryptionKeyFileNotOwnedByProcessUserError } from "./EncryptionKeyFileNotOwnedByProcessUserError.js";
export { EncryptionKeyFileTooPermissiveError } from "./EncryptionKeyFileTooPermissiveError.js";
export { EncryptionKeyInvalidFormatError } from "./EncryptionKeyInvalidFormatError.js";
export { InvalidCredentialStatusError } from "./InvalidCredentialStatusError.js";
export { InvalidCredentialTypeError } from "./InvalidCredentialTypeError.js";
export { InvalidTargetUrlError } from "./InvalidTargetUrlError.js";
export { MissingUrlError } from "./MissingUrlError.js";
export { MissingUserAgentError } from "./MissingUserAgentError.js";
export { NoMatchingCredentialError } from "./NoMatchingCredentialError.js";
export { OAuthStateInvalidError } from "./OAuthStateInvalidError.js";
export { OAuthTokenExchangeFailedError } from "./OAuthTokenExchangeFailedError.js";
export { OverlappingAllowedRequestError } from "./OverlappingAllowedRequestError.js";
export { ReservedHeaderError } from "./ReservedHeaderError.js";
export { UpstreamRequestFailedError } from "./UpstreamRequestFailedError.js";

import { CallerIpNotAllowedError } from "./CallerIpNotAllowedError.js";
import { CredentialNotFoundError } from "./CredentialNotFoundError.js";
import { EncryptionKeyFileMissingError } from "./EncryptionKeyFileMissingError.js";
import { EncryptionKeyFileNotOwnedByProcessUserError } from "./EncryptionKeyFileNotOwnedByProcessUserError.js";
import { EncryptionKeyFileTooPermissiveError } from "./EncryptionKeyFileTooPermissiveError.js";
import { EncryptionKeyInvalidFormatError } from "./EncryptionKeyInvalidFormatError.js";
import { InvalidCredentialStatusError } from "./InvalidCredentialStatusError.js";
import { InvalidCredentialTypeError } from "./InvalidCredentialTypeError.js";
import { InvalidTargetUrlError } from "./InvalidTargetUrlError.js";
import { MissingUrlError } from "./MissingUrlError.js";
import { MissingUserAgentError } from "./MissingUserAgentError.js";
import { NoMatchingCredentialError } from "./NoMatchingCredentialError.js";
import { OAuthStateInvalidError } from "./OAuthStateInvalidError.js";
import { OAuthTokenExchangeFailedError } from "./OAuthTokenExchangeFailedError.js";
import { OverlappingAllowedRequestError } from "./OverlappingAllowedRequestError.js";
import { ReservedHeaderError } from "./ReservedHeaderError.js";
import { UpstreamRequestFailedError } from "./UpstreamRequestFailedError.js";

export const SemanticError = Schema.Union(
  CallerIpNotAllowedError,
  MissingUrlError,
  InvalidTargetUrlError,
  MissingUserAgentError,
  ReservedHeaderError,
  NoMatchingCredentialError,
  OverlappingAllowedRequestError,
  CredentialNotFoundError,
  InvalidCredentialTypeError,
  InvalidCredentialStatusError,
  OAuthStateInvalidError,
  OAuthTokenExchangeFailedError,
  UpstreamRequestFailedError,
  EncryptionKeyFileMissingError,
  EncryptionKeyFileNotOwnedByProcessUserError,
  EncryptionKeyFileTooPermissiveError,
  EncryptionKeyInvalidFormatError,
);
export type SemanticError = Schema.Schema.Type<typeof SemanticError>;

export const ErrorResponseBody = Schema.Struct({
  error: Schema.Struct({
    code: Schema.Union(
      Schema.Literal("CallerIpNotAllowedError"),
      Schema.Literal("MissingUrlError"),
      Schema.Literal("InvalidTargetUrlError"),
      Schema.Literal("MissingUserAgentError"),
      Schema.Literal("ReservedHeaderError"),
      Schema.Literal("NoMatchingCredentialError"),
      Schema.Literal("OverlappingAllowedRequestError"),
      Schema.Literal("CredentialNotFoundError"),
      Schema.Literal("InvalidCredentialTypeError"),
      Schema.Literal("InvalidCredentialStatusError"),
      Schema.Literal("OAuthStateInvalidError"),
      Schema.Literal("OAuthTokenExchangeFailedError"),
      Schema.Literal("UpstreamRequestFailedError"),
      Schema.Literal("EncryptionKeyFileMissingError"),
      Schema.Literal("EncryptionKeyFileNotOwnedByProcessUserError"),
      Schema.Literal("EncryptionKeyFileTooPermissiveError"),
      Schema.Literal("EncryptionKeyInvalidFormatError"),
    ),
    message: Schema.String,
  }),
});
export type ErrorResponseBody = Schema.Schema.Type<typeof ErrorResponseBody>;

export const semanticErrorMakers = Data.array([
  () => CallerIpNotAllowedError.make(),
  () => MissingUrlError.make(),
  () => InvalidTargetUrlError.make(),
  () => MissingUserAgentError.make(),
  () => ReservedHeaderError.make(),
  () => NoMatchingCredentialError.make(),
  () => OverlappingAllowedRequestError.make(),
  () => CredentialNotFoundError.make(),
  () => InvalidCredentialTypeError.make(),
  () => InvalidCredentialStatusError.make(),
  () => OAuthStateInvalidError.make(),
  () => OAuthTokenExchangeFailedError.make(),
  () => UpstreamRequestFailedError.make(),
  () => EncryptionKeyFileMissingError.make(),
  () => EncryptionKeyFileNotOwnedByProcessUserError.make(),
  () => EncryptionKeyFileTooPermissiveError.make(),
  () => EncryptionKeyInvalidFormatError.make(),
]);

export function toErrorResponseBody(error: SemanticError): ErrorResponseBody {
  return {
    error: {
      code: error.code,
      message: error.message,
    },
  };
}
