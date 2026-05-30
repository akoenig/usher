import { Command, CommandExecutor, FileSystem } from "@effect/platform";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer, Sink, Stream } from "effect";
import { NodeInspectSymbol } from "effect/Inspectable";
import {
  installUsherDaemonService,
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
      usherDaemonServiceUnit({
        executablePath: "/home/alice/My Tools/usher's cli",
        nodeExecutablePath:
          "/home/alice/.local/share/fnm/node-versions/v24.16.0/installation/bin/node",
      }),
      [
        "[Unit]",
        "Description=Usher daemon",
        "",
        "[Service]",
        "Environment=USHER_NODE=/home/alice/.local/share/fnm/node-versions/v24.16.0/installation/bin/node",
        "ExecStart='/home/alice/My Tools/usher'\\''s cli' daemon start",
        "Restart=on-failure",
        "",
        "[Install]",
        "WantedBy=default.target",
        "",
      ].join("\n"),
    );
  });

  it.effect("installs the unit and runs systemd commands for the current user", () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const fileSystem = makeRecordingFileSystem(events);
      const commandExecutor = makeRecordingCommandExecutor(events);

      yield* installUsherDaemonService({
        executablePath: "/usr/local/bin/usher",
        homeDirectory: "/home/alice",
        nodeExecutablePath: "/usr/local/bin/node",
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
        "command:loginctl show-user alice -p Linger",
        "command:systemctl --user enable --now usher.service",
      ]);
    }),
  );

  it.effect("fails installation when lingering remains disabled", () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const fileSystem = makeRecordingFileSystem(events);
      const commandExecutor = makeRecordingCommandExecutor(events, "Linger=no\n");

      const error = yield* installUsherDaemonService({
        executablePath: "/usr/local/bin/usher",
        homeDirectory: "/home/alice",
        nodeExecutablePath: "/usr/local/bin/node",
        username: "alice",
      }).pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, fileSystem)),
        Effect.provide(Layer.succeed(CommandExecutor.CommandExecutor, commandExecutor)),
        Effect.flip,
      );

      assert.assertInstanceOf(error, Error);
      assert.strictEqual(
        error.message,
        "loginctl enable-linger alice completed, but lingering is still disabled. Run: sudo loginctl enable-linger alice",
      );
      assert.deepStrictEqual(events, [
        "mkdir:/home/alice/.config/systemd/user:true",
        "write:/home/alice/.config/systemd/user/usher.service:[Unit]",
        "command:systemctl --user daemon-reload",
        "command:loginctl enable-linger alice",
        "command:loginctl show-user alice -p Linger",
      ]);
    }),
  );
});

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
    sink: () => Sink.drain,
    stat: () => unsupported,
    stream: () => Stream.empty,
    symlink: () => unsupported,
    truncate: () => unsupported,
    utimes: () => unsupported,
    watch: () => Stream.empty,
    writeFile: () => unsupported,
    writeFileString: (path, content) =>
      Effect.sync(() => {
        events.push(`write:${path}:${content.split("\n")[0]}`);
      }),
  };
}

function makeRecordingCommandExecutor(
  events: Array<string>,
  lingerOutput = "Linger=yes\n",
): CommandExecutor.CommandExecutor {
  return CommandExecutor.makeExecutor((command) =>
    Effect.sync(() => {
      const standardCommand = Command.flatten(command)[0];
      events.push(`command:${standardCommand.command} ${standardCommand.args.join(" ")}`);
      const output =
        standardCommand.command === "loginctl" && standardCommand.args[0] === "show-user"
          ? lingerOutput
          : "";

      return {
        [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
        pid: CommandExecutor.ProcessId(1),
        exitCode: Effect.succeed(CommandExecutor.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stderr: Stream.empty,
        stdin: Sink.drain,
        stdout:
          output === "" ? Stream.empty : Stream.fromIterable([new TextEncoder().encode(output)]),
        toString: () => "Process(1)",
        toJSON: () => ({ _id: "@effect/platform/CommandExecutor/Process", pid: 1 }),
        [NodeInspectSymbol]: () => "Process(1)",
      };
    }),
  );
}
