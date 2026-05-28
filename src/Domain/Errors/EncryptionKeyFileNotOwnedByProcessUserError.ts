import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class EncryptionKeyFileNotOwnedByProcessUserError extends Schema.TaggedError<EncryptionKeyFileNotOwnedByProcessUserError>(
  "EncryptionKeyFileNotOwnedByProcessUserError",
)("EncryptionKeyFileNotOwnedByProcessUserError", {
  code: codeField("EncryptionKeyFileNotOwnedByProcessUserError"),
  message: messageField("Encryption key file is not owned by the process user"),
}) {}
