# Daemon Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `usher daemon install` as a user-bound systemd installer and make `usher daemon` alias `usher daemon start`.

**Architecture:** Keep host-specific systemd behavior in `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`. `UsherCli.ts` owns CLI shape and passes the current executable path, home directory, and current username into the installer. Tests verify generated unit text, process command sequencing, and command tree shape without requiring a live systemd session.

**Tech Stack:** TypeScript, Effect, `@effect/cli`, `@effect/platform` `FileSystem` and `Command`, `@effect/platform-node` live layers, `@effect/vitest`.

---

## File Structure

- Create `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`: pure unit rendering helpers plus Effect-based filesystem/process install workflow.
- Create `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`: pure tests for unit rendering and workflow tests with mocked filesystem/process services.
- Modify `src/Infrastructure/Cli/UsherCli.ts`: split daemon command into `start` and `install`, keep parent `daemon` as start alias, provide Node command/filesystem layers.
- Modify `src/Infrastructure/Cli/UsherCli.spec.ts`: assert daemon command tree includes `start` and `install`.

### Task 1: Add Systemd Unit Rendering

**Files:**

- Create: `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`
- Test: `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

- [ ] **Step 1: Write failing unit rendering tests**

Add `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`:

```ts
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import {
  systemdEscapeExecArg,
  systemdUserUnitPath,
  usherDaemonServiceUnit,
} from "./DaemonSystemdInstaller.js";

describe("DaemonSystemdInstaller", () => {
  it("builds the user unit path under the invoking user's home directory", () => {
    assert.strictEqual(
      systemdUserUnitPath("/home/alice"),
      "/home/alice/.config/systemd/user/usher.service",
    );
  });

  it("escapes systemd ExecStart arguments", () => {
    assert.strictEqual(systemdEscapeExecArg("/opt/usher/bin/usher"), "/opt/usher/bin/usher");
    assert.strictEqual(
      systemdEscapeExecArg("/home/alice/My Tools/usher's cli"),
      "'/home/alice/My Tools/usher'\\''s cli'",
    );
  });

  it("renders an usher daemon user unit", () => {
    assert.strictEqual(
      usherDaemonServiceUnit("/home/alice/My Tools/usher's cli"),
      [
        "[Unit]",
        "Description=Usher daemon",
        "",
        "[Service]",
        "ExecStart='/home/alice/My Tools/usher'\\''s cli' daemon start",
        "Restart=on-failure",
        "",
        "[Install]",
        "WantedBy=default.target",
        "",
      ].join("\n"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: FAIL because `DaemonSystemdInstaller.js` does not exist.

- [ ] **Step 3: Implement minimal unit rendering helpers**

Create `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`:

```ts
import { FileSystem, Command as PlatformCommand } from "@effect/platform";
import { Effect } from "effect";

export const UsherDaemonServiceName = "usher.service";

export function systemdUserUnitDirectory(homeDirectory: string) {
  return `${homeDirectory}/.config/systemd/user`;
}

export function systemdUserUnitPath(homeDirectory: string) {
  return `${systemdUserUnitDirectory(homeDirectory)}/${UsherDaemonServiceName}`;
}

export function systemdEscapeExecArg(value: string) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function usherDaemonServiceUnit(executablePath: string) {
  return [
    "[Unit]",
    "Description=Usher daemon",
    "",
    "[Service]",
    `ExecStart=${systemdEscapeExecArg(executablePath)} daemon start`,
    "Restart=on-failure",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

export function installUsherDaemonService(input: {
  readonly executablePath: string;
  readonly homeDirectory: string;
  readonly username: string;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const unitDirectory = systemdUserUnitDirectory(input.homeDirectory);
    const unitPath = systemdUserUnitPath(input.homeDirectory);

    yield* fs.makeDirectory(unitDirectory, { recursive: true });
    yield* fs.writeFileString(unitPath, usherDaemonServiceUnit(input.executablePath));
    yield* runCommand("systemctl", "--user", "daemon-reload");
    yield* runCommand("loginctl", "enable-linger", input.username);
    yield* runCommand("systemctl", "--user", "enable", "--now", UsherDaemonServiceName);
  });
}

function runCommand(command: string, ...args: ReadonlyArray<string>) {
  return PlatformCommand.make(command, ...args).pipe(
    PlatformCommand.exitCode,
    Effect.flatMap((code) =>
      Number(code) === 0 ? Effect.void : Effect.fail(new Error(`${command} failed`)),
    ),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS with no type errors.

### Task 2: Add Install Workflow Test

**Files:**

- Modify: `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`
- Modify: `src/Infrastructure/Cli/DaemonSystemdInstaller.ts` if needed for typecheck

- [ ] **Step 1: Add a workflow test with mocked services**

Append this import block to `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts` imports:

```ts
import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Layer } from "effect";
import { installUsherDaemonService } from "./DaemonSystemdInstaller.js";
```

Append this test inside the existing `describe` block:

```ts
it.effect("installs the unit and runs systemd commands for the current user", () =>
  Effect.gen(function* () {
    const events: Array<string> = [];
    const fileSystem = makeRecordingFileSystem(events);
    const commandExecutor = makeRecordingCommandExecutor(events);

    yield* installUsherDaemonService({
      executablePath: "/usr/local/bin/usher",
      homeDirectory: "/home/alice",
      username: "alice",
    }).pipe(
      Effect.provide(Layer.succeed(FileSystem.FileSystem, fileSystem)),
      Effect.provide(Layer.succeed(CommandExecutor.CommandExecutor, commandExecutor)),
    );

    assert.deepStrictEqual(events, [
      "mkdir:/home/alice/.config/systemd/user:true",
      "write:/home/alice/.config/systemd/user/usher.service:[Unit]",
      "command:systemctl --user daemon-reload",
      "command:loginctl enable-linger alice",
      "command:systemctl --user enable --now usher.service",
    ]);
  }),
);
```

Append these test helpers after the `describe` block:

```ts
function makeRecordingFileSystem(events: Array<string>): FileSystem.FileSystem {
  const unsupported = Effect.die("unsupported filesystem operation");

  return {
    access: () => unsupported,
    copy: () => unsupported,
    copyFile: () => unsupported,
    chmod: () => unsupported,
    chown: () => unsupported,
    exists: () => unsupported,
    link: () => unsupported,
    makeDirectory: (path, options) =>
      Effect.sync(() => {
        events.push(`mkdir:${path}:${options?.recursive === true}`);
      }),
    makeTempDirectory: () => unsupported,
    makeTempDirectoryScoped: () => unsupported,
    makeTempFile: () => unsupported,
    makeTempFileScoped: () => unsupported,
    open: () => unsupported,
    readDirectory: () => unsupported,
    readFile: () => unsupported,
    readFileString: () => unsupported,
    readLink: () => unsupported,
    realPath: () => unsupported,
    remove: () => unsupported,
    rename: () => unsupported,
    sink: () => Effect.die("unsupported filesystem sink"),
    stat: () => unsupported,
    stream: () => Effect.die("unsupported filesystem stream"),
    symlink: () => unsupported,
    truncate: () => unsupported,
    utimes: () => unsupported,
    watch: () => Effect.die("unsupported filesystem watch"),
    writeFile: () => unsupported,
    writeFileString: (path, content) =>
      Effect.sync(() => {
        events.push(`write:${path}:${content.split("\n")[0]}`);
      }),
  };
}

function makeRecordingCommandExecutor(events: Array<string>): CommandExecutor.CommandExecutor {
  return CommandExecutor.makeExecutor((command) =>
    Effect.sync(() => {
      const standardCommand = Command.flatten(command)[0];
      events.push(`command:${standardCommand.command} ${standardCommand.args.join(" ")}`);

      return {
        [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
        pid: CommandExecutor.ProcessId(1),
        exitCode: Effect.succeed(CommandExecutor.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stderr: Effect.die("unsupported stderr"),
        stdin: Effect.die("unsupported stdin"),
        stdout: Effect.die("unsupported stdout"),
        toJSON: () => ({ _id: "@effect/platform/CommandExecutor/Process", pid: 1 }),
        [Symbol.for("nodejs.util.inspect.custom")]: () => "Process(1)",
      };
    }),
  );
}
```

- [ ] **Step 2: Run test to verify behavior**

Run: `pnpm test -- src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: PASS. If type errors show missing `FileSystem` members, inspect `node_modules/@effect/platform/src/FileSystem.ts` and add unsupported stubs for the exact missing members only.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS with no type errors.

### Task 3: Wire CLI Commands

**Files:**

- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts`
- Modify: `src/Infrastructure/Cli/UsherCli.ts`

- [ ] **Step 1: Write failing CLI command tree test**

Modify `src/Infrastructure/Cli/UsherCli.spec.ts` in the first test:

```ts
it("defines the usher command tree", () => {
  const usherNames = Command.getNames(usherCommand);
  const usherSubcommands = Command.getSubcommands(usherCommand);
  const daemonCommand = HashMap.unsafeGet(usherSubcommands, "daemon");
  const daemonSubcommands = Command.getSubcommands(daemonCommand);
  const credentialsSubcommands = Command.getSubcommands(credentialsCommand);

  assert.assertTrue(HashSet.has(usherNames, "usher"));
  assert.assertTrue(HashMap.has(usherSubcommands, "daemon"));
  assert.assertTrue(HashMap.has(usherSubcommands, "credentials"));
  assert.assertTrue(HashMap.has(daemonSubcommands, "start"));
  assert.assertTrue(HashMap.has(daemonSubcommands, "install"));
  assert.assertTrue(HashMap.has(credentialsSubcommands, "list"));
  assert.assertTrue(HashMap.has(credentialsSubcommands, "get"));
  assert.assertTrue(HashMap.has(credentialsSubcommands, "delete"));
  assert.assertTrue(HashMap.has(credentialsSubcommands, "create-bearer-token"));
  assert.assertTrue(HashMap.has(credentialsSubcommands, "create-oauth2"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/Infrastructure/Cli/UsherCli.spec.ts`

Expected: FAIL because `daemon` does not yet expose `start` and `install` subcommands.

- [ ] **Step 3: Implement CLI wiring**

Modify imports in `src/Infrastructure/Cli/UsherCli.ts`:

```ts
import {
  NodeCommandExecutor,
  NodeContext,
  NodeFileSystem,
  NodeHttpClient,
} from "@effect/platform-node";
```

Add this import:

```ts
import { installUsherDaemonService, UsherDaemonServiceName } from "./DaemonSystemdInstaller.js";
```

Replace the existing `daemonCommand` with:

```ts
const daemonStartCommand = Command.make("start", {}, () => runUsherDaemon);

const daemonInstallCommand = Command.make("install", {}, () =>
  Effect.gen(function* () {
    yield* installUsherDaemonService({
      executablePath: currentExecutablePath(),
      homeDirectory: currentHomeDirectory(),
      username: currentUsername(),
    });

    yield* Console.log(`${UsherDaemonServiceName} installed and started.`);
  }),
);

const daemonCommand = Command.make("daemon", {}, () => runUsherDaemon).pipe(
  Command.withSubcommands([daemonStartCommand, daemonInstallCommand]),
);
```

Update the provider in `runUsherCli`:

```ts
    Effect.provide(
      Layer.mergeAll(
        NodeContext.layer,
        NodeHttpClient.layer,
        NodeFileSystem.layer,
        NodeCommandExecutor.layer,
      ),
    ),
```

Add helpers near the bottom of `UsherCli.ts`:

```ts
function currentExecutablePath() {
  return process.argv[1] ?? "usher";
}

function currentHomeDirectory() {
  return process.env.HOME ?? ".";
}

function currentUsername() {
  return process.env.USER ?? process.env.LOGNAME ?? "";
}
```

- [ ] **Step 4: Run CLI tests**

Run: `pnpm test -- src/Infrastructure/Cli/UsherCli.spec.ts src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS with no type errors.

### Task 4: Final Verification and Commit

**Files:**

- Modify: `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`
- Modify: `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`
- Modify: `src/Infrastructure/Cli/UsherCli.ts`
- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts`

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`

Expected: PASS with no type errors.

- [ ] **Step 2: Run full tests**

Run: `pnpm test`

Expected: PASS with all test files passing.

- [ ] **Step 3: Review diff**

Run: `git diff`

Expected: only daemon installer, CLI wiring, tests, and this plan file are changed.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add docs/superpowers/plans/2026-05-28-daemon-install.md src/Infrastructure/Cli/DaemonSystemdInstaller.ts src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts src/Infrastructure/Cli/UsherCli.ts src/Infrastructure/Cli/UsherCli.spec.ts
git commit -m "Implement daemon install command"
```

- [ ] **Step 5: Push implementation branch**

Run: `git push`

Expected: branch `issue-4-daemon-install` pushes to `origin/issue-4-daemon-install`.

## Self-Review

- Spec coverage: the plan covers `daemon start`, `daemon` as start alias, `daemon install`, user systemd unit path, current-user command execution, lingering, service start, tests, and no live systemd dependency.
- Placeholder scan: no placeholders remain; all code and commands needed for implementation are included.
- Type consistency: helper names and imports are consistent across tasks.
