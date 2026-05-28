import { Schema } from "effect";

export function codeField<const Code extends string>(code: Code) {
  return Schema.propertySignature(Schema.Literal(code)).pipe(
    Schema.withConstructorDefault(() => code),
  );
}

export function messageField(message: string) {
  return Schema.propertySignature(Schema.String).pipe(Schema.withConstructorDefault(() => message));
}
