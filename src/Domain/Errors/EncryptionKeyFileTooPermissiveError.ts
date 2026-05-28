import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class EncryptionKeyFileTooPermissiveError extends Schema.TaggedError<EncryptionKeyFileTooPermissiveError>(
  "EncryptionKeyFileTooPermissiveError",
)("EncryptionKeyFileTooPermissiveError", {
  code: codeField("EncryptionKeyFileTooPermissiveError"),
  message: messageField("Encryption key file permissions are too permissive"),
}) {}
