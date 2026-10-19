import { Command } from "clipanion";

import { AppCommand } from "../base-command";
import { resolveMigrationsRoot } from "../migrations";
import { loadPersistence } from "../persistence";

export class DatabaseMigrateCliCommand extends AppCommand {
  static override paths = [["db", "migrate"], ["migrate"]];
  static override usage = Command.Usage({ description: "Apply pending database migrations" });

  async execute(): Promise<number> {
    const persistence = await loadPersistence();
    await persistence.migrate({ migrationsRoot: resolveMigrationsRoot() });
    this.write({ ok: true });
    return 0;
  }
}

export const databaseCliCommands = [DatabaseMigrateCliCommand];
