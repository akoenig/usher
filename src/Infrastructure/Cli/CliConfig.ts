import { Config, Effect, Schema } from "effect";
import { DefaultUsherPort } from "../Config/UsherConfig.js";

export const UsherCliConfig = Schema.Struct({
  port: Schema.Number,
});
export type UsherCliConfig = Schema.Schema.Type<typeof UsherCliConfig>;

export const loadUsherCliConfig = Config.all({
  port: Config.port("USHER_PORT").pipe(Config.withDefault(DefaultUsherPort)),
}).pipe(Effect.flatMap(Schema.decodeUnknown(UsherCliConfig)));

export function localAdminBaseUrl(port: number) {
  return `http://127.0.0.1:${port}`;
}
