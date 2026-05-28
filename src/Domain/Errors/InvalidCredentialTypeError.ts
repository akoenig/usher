import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class InvalidCredentialTypeError extends Schema.TaggedError<InvalidCredentialTypeError>(
  "InvalidCredentialTypeError",
)("InvalidCredentialTypeError", {
  code: codeField("InvalidCredentialTypeError"),
  message: messageField("Credential type is invalid"),
}) {}
