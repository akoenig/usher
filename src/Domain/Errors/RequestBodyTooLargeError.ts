import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class RequestBodyTooLargeError extends Schema.TaggedError<RequestBodyTooLargeError>(
  "RequestBodyTooLargeError",
)("RequestBodyTooLargeError", {
  code: codeField("RequestBodyTooLargeError"),
  message: messageField("Request body exceeds the configured maximum size"),
}) {}
