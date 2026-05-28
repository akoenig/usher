import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class OverlappingAllowedRequestError extends Schema.TaggedError<OverlappingAllowedRequestError>(
  "OverlappingAllowedRequestError",
)("OverlappingAllowedRequestError", {
  code: codeField("OverlappingAllowedRequestError"),
  message: messageField("Allowed request overlaps an existing credential"),
}) {}
