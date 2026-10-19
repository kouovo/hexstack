import { Builtins, Cli } from "clipanion";

import pkg from "../package.json";
import type { CliCommandContext } from "./base-command";
import { databaseCliCommands } from "./commands/database";
import { storageCliCommands } from "./commands/storage";
import { userCliCommands } from "./commands/user";

export function createCli() {
  return Cli.from<CliCommandContext>(
    [Builtins.HelpCommand, Builtins.VersionCommand, ...databaseCliCommands, ...userCliCommands, ...storageCliCommands],
    {
      binaryLabel: "App server CLI",
      binaryName: "app",
      binaryVersion: pkg.version,
    },
  );
}
