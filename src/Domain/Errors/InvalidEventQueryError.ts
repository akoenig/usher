import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class InvalidEventQueryError extends Schema.TaggedError<InvalidEventQueryError>(
  "InvalidEventQueryError",
)("InvalidEventQueryError", {
  code: codeField("InvalidEventQueryError"),
  message: messageField("Event query is invalid"),
}) {}
