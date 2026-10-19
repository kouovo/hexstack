import { Command, Option, type BaseContext } from "clipanion";

import type { AppCliContext } from "./context";

export type CliCommandContext = BaseContext & AppCliContext;

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export abstract class AppCommand extends Command<CliCommandContext> {
  json = Option.Boolean("--json", false, {
    description: "Emit compact JSON for scripts",
  });

  protected write(value: unknown): void {
    const output = value === undefined ? { ok: true } : value;
    this.context.stdout.write(`${JSON.stringify(output, jsonReplacer, this.json ? undefined : 2)}\n`);
  }
}
