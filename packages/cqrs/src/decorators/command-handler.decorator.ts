import "reflect-metadata";
import { generateId } from "@app/core";
import type { Class } from "type-fest";

import type { Command } from "..";
import { COMMAND_HANDLER_METADATA, COMMAND_METADATA } from "./constants";

export const commandHandler = (command: Class<Command>): ClassDecorator => {
  return (target: object) => {
    if (!Reflect.hasOwnMetadata(COMMAND_METADATA, command)) {
      Reflect.defineMetadata(COMMAND_METADATA, { id: generateId("cmdtype") }, command);
    }
    Reflect.defineMetadata(COMMAND_HANDLER_METADATA, command, target);
  };
};
