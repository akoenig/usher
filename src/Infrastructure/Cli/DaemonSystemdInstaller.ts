import { Command as PlatformCommand, FileSystem } from "@effect/platform";
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
