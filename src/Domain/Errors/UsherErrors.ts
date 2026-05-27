import { Data, Schema } from "effect"

function codeField<const Code extends string>(code: Code) {
  return Schema.propertySignature(Schema.Literal(code)).pipe(
    Schema.withConstructorDefault(() => code)
  )
}

function messageField(message: string) {
  return Schema.propertySignature(Schema.String).pipe(
    Schema.withConstructorDefault(() => message)
  )
}

export class CallerIpNotAllowedError extends Schema.TaggedError<CallerIpNotAllowedError>(
  "CallerIpNotAllowedError"
)("CallerIpNotAllowedError", {
  code: codeField("CallerIpNotAllowedError"),
  message: messageField("Caller IP is not allowed")
}) {}

export class MissingUrlError extends Schema.TaggedError<MissingUrlError>("MissingUrlError")(
  "MissingUrlError",
  {
    code: codeField("MissingUrlError"),
    message: messageField("Missing target URL")
  }
) {}

export class InvalidTargetUrlError extends Schema.TaggedError<InvalidTargetUrlError>(
  "InvalidTargetUrlError"
)("InvalidTargetUrlError", {
  code: codeField("InvalidTargetUrlError"),
  message: messageField("Target URL is invalid")
}) {}

export class MissingUserAgentError extends Schema.TaggedError<MissingUserAgentError>(
  "MissingUserAgentError"
)("MissingUserAgentError", {
  code: codeField("MissingUserAgentError"),
  message: messageField("Missing user agent")
}) {}

export class ReservedHeaderError extends Schema.TaggedError<ReservedHeaderError>(
  "ReservedHeaderError"
)("ReservedHeaderError", {
  code: codeField("ReservedHeaderError"),
  message: messageField("Request includes a reserved header")
}) {}

export class NoMatchingCredentialError extends Schema.TaggedError<NoMatchingCredentialError>(
  "NoMatchingCredentialError"
)("NoMatchingCredentialError", {
  code: codeField("NoMatchingCredentialError"),
  message: messageField("No matching credential found for the requested URL")
}) {}

export class OverlappingAllowedRequestError extends Schema.TaggedError<OverlappingAllowedRequestError>(
  "OverlappingAllowedRequestError"
)("OverlappingAllowedRequestError", {
  code: codeField("OverlappingAllowedRequestError"),
  message: messageField("Allowed request overlaps an existing credential")
}) {}

export class CredentialNotFoundError extends Schema.TaggedError<CredentialNotFoundError>(
  "CredentialNotFoundError"
)("CredentialNotFoundError", {
  code: codeField("CredentialNotFoundError"),
  message: messageField("Credential was not found")
}) {}

export class InvalidCredentialTypeError extends Schema.TaggedError<InvalidCredentialTypeError>(
  "InvalidCredentialTypeError"
)("InvalidCredentialTypeError", {
  code: codeField("InvalidCredentialTypeError"),
  message: messageField("Credential type is invalid")
}) {}

export class InvalidCredentialStatusError extends Schema.TaggedError<InvalidCredentialStatusError>(
  "InvalidCredentialStatusError"
)("InvalidCredentialStatusError", {
  code: codeField("InvalidCredentialStatusError"),
  message: messageField("Credential status is invalid")
}) {}

export class OAuthStateInvalidError extends Schema.TaggedError<OAuthStateInvalidError>(
  "OAuthStateInvalidError"
)("OAuthStateInvalidError", {
  code: codeField("OAuthStateInvalidError"),
  message: messageField("OAuth state is invalid")
}) {}

export class OAuthTokenExchangeFailedError extends Schema.TaggedError<OAuthTokenExchangeFailedError>(
  "OAuthTokenExchangeFailedError"
)("OAuthTokenExchangeFailedError", {
  code: codeField("OAuthTokenExchangeFailedError"),
  message: messageField("OAuth token exchange failed")
}) {}

export class EncryptionKeyFileMissingError extends Schema.TaggedError<EncryptionKeyFileMissingError>(
  "EncryptionKeyFileMissingError"
)("EncryptionKeyFileMissingError", {
  code: codeField("EncryptionKeyFileMissingError"),
  message: messageField("Encryption key file is missing")
}) {}

export class EncryptionKeyFileNotOwnedByProcessUserError extends Schema.TaggedError<EncryptionKeyFileNotOwnedByProcessUserError>(
  "EncryptionKeyFileNotOwnedByProcessUserError"
)("EncryptionKeyFileNotOwnedByProcessUserError", {
  code: codeField("EncryptionKeyFileNotOwnedByProcessUserError"),
  message: messageField("Encryption key file is not owned by the process user")
}) {}

export class EncryptionKeyFileTooPermissiveError extends Schema.TaggedError<EncryptionKeyFileTooPermissiveError>(
  "EncryptionKeyFileTooPermissiveError"
)("EncryptionKeyFileTooPermissiveError", {
  code: codeField("EncryptionKeyFileTooPermissiveError"),
  message: messageField("Encryption key file permissions are too permissive")
}) {}

export class EncryptionKeyInvalidFormatError extends Schema.TaggedError<EncryptionKeyInvalidFormatError>(
  "EncryptionKeyInvalidFormatError"
)("EncryptionKeyInvalidFormatError", {
  code: codeField("EncryptionKeyInvalidFormatError"),
  message: messageField("Encryption key format is invalid")
}) {}

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
  EncryptionKeyFileMissingError,
  EncryptionKeyFileNotOwnedByProcessUserError,
  EncryptionKeyFileTooPermissiveError,
  EncryptionKeyInvalidFormatError
)
export type SemanticError = Schema.Schema.Type<typeof SemanticError>

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
      Schema.Literal("EncryptionKeyFileMissingError"),
      Schema.Literal("EncryptionKeyFileNotOwnedByProcessUserError"),
      Schema.Literal("EncryptionKeyFileTooPermissiveError"),
      Schema.Literal("EncryptionKeyInvalidFormatError")
    ),
    message: Schema.String
  })
})
export type ErrorResponseBody = Schema.Schema.Type<typeof ErrorResponseBody>

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
  () => EncryptionKeyFileMissingError.make(),
  () => EncryptionKeyFileNotOwnedByProcessUserError.make(),
  () => EncryptionKeyFileTooPermissiveError.make(),
  () => EncryptionKeyInvalidFormatError.make()
])

export function toErrorResponseBody(error: SemanticError): ErrorResponseBody {
  return {
    error: {
      code: error.code,
      message: error.message
    }
  }
}
