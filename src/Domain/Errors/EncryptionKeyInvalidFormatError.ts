import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class EncryptionKeyInvalidFormatError extends Schema.TaggedError<EncryptionKeyInvalidFormatError>(
  "EncryptionKeyInvalidFormatError",
)("EncryptionKeyInvalidFormatError", {
  code: codeField("EncryptionKeyInvalidFormatError"),
  message: messageField("Encryption key format is invalid"),
}) {}
