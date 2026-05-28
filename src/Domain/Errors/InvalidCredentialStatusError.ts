import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class InvalidCredentialStatusError extends Schema.TaggedError<InvalidCredentialStatusError>(
  "InvalidCredentialStatusError",
)("InvalidCredentialStatusError", {
  code: codeField("InvalidCredentialStatusError"),
  message: messageField("Credential status is invalid"),
}) {}
