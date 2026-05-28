import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class InvalidTargetUrlError extends Schema.TaggedError<InvalidTargetUrlError>(
  "InvalidTargetUrlError",
)("InvalidTargetUrlError", {
  code: codeField("InvalidTargetUrlError"),
  message: messageField("Target URL is invalid"),
}) {}
