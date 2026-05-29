import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { randomBytes } from "node:crypto";
import { DefaultUsherPort } from "../Config/UsherConfig.js";

export function usherConfigDirectory(homeDirectory: string) {
  return `${homeDirectory}/.config/usher`;
}

export function usherConfigPath(homeDirectory: string) {
  return `${usherConfigDirectory(homeDirectory)}/config.json`;
}

export function initializeUsherConfig(input: {
  readonly homeDirectory: string;
  readonly generateEncryptionKey?: Effect.Effect<string>;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const configDirectory = usherConfigDirectory(input.homeDirectory);
    const configPath = usherConfigPath(input.homeDirectory);

    yield* fs.makeDirectory(configDirectory, { recursive: true });
    const exists = yield* fs.exists(configPath);
    if (exists) {
      const existing = yield* fs.readFileString(configPath);
      if (existing.length > 0) {
        return yield* Effect.fail(new Error(`Config already exists at ${configPath}`));
      }
    } else {
      yield* fs.writeFileString(configPath, "");
    }

    yield* fs.chmod(configPath, 0o600);
    const encryptionKey = yield* input.generateEncryptionKey ?? generateEncryptionKey;
    yield* fs.writeFileString(
      configPath,
      renderInitialUsherConfig({ homeDirectory: input.homeDirectory, encryptionKey }),
    );

    return configPath;
  });
}

export function renderInitialUsherConfig(input: {
  readonly homeDirectory: string;
  readonly encryptionKey: string;
}) {
  return [
    "{",
    `  "databasePath": "${input.homeDirectory}/.config/usher/usher.sqlite",`,
    `  "encryptionKey": "${input.encryptionKey}",`,
    '  "baseUrl": "http://localhost:3000",',
    '  "allowedCallerIps": ["127.0.0.1", "::1"],',
    `  "port": ${DefaultUsherPort}`,
    "}",
    "",
  ].join("\n");
}

const generateEncryptionKey = Effect.sync(
  () => `base64url:${randomBytes(32).toString("base64url")}`,
);
