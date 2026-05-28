import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class OAuthStateInvalidError extends Schema.TaggedError<OAuthStateInvalidError>(
  "OAuthStateInvalidError",
)("OAuthStateInvalidError", {
  code: codeField("OAuthStateInvalidError"),
  message: messageField("OAuth state is invalid"),
}) {}
