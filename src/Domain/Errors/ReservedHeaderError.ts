import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class ReservedHeaderError extends Schema.TaggedError<ReservedHeaderError>(
  "ReservedHeaderError",
)("ReservedHeaderError", {
  code: codeField("ReservedHeaderError"),
  message: messageField("Request includes a reserved header"),
}) {}
