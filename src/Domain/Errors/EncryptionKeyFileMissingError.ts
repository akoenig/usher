import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class EncryptionKeyFileMissingError extends Schema.TaggedError<EncryptionKeyFileMissingError>(
  "EncryptionKeyFileMissingError",
)("EncryptionKeyFileMissingError", {
  code: codeField("EncryptionKeyFileMissingError"),
  message: messageField("Encryption key file is missing"),
}) {}
