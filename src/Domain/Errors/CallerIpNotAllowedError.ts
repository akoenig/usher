import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class CallerIpNotAllowedError extends Schema.TaggedError<CallerIpNotAllowedError>(
  "CallerIpNotAllowedError",
)("CallerIpNotAllowedError", {
  code: codeField("CallerIpNotAllowedError"),
  message: messageField("Caller IP is not allowed"),
}) {}
