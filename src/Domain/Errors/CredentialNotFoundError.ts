import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class CredentialNotFoundError extends Schema.TaggedError<CredentialNotFoundError>(
  "CredentialNotFoundError",
)("CredentialNotFoundError", {
  code: codeField("CredentialNotFoundError"),
  message: messageField("Credential was not found"),
}) {}
