import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class NoMatchingCredentialError extends Schema.TaggedError<NoMatchingCredentialError>(
  "NoMatchingCredentialError",
)("NoMatchingCredentialError", {
  code: codeField("NoMatchingCredentialError"),
  message: messageField("No matching credential found for the requested URL"),
}) {}
