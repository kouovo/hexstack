import "reflect-metadata";
import { generateId, type DomainEvent } from "@app/core";
import type { Class } from "type-fest";

import { EVENT_HANDLER_METADATA, EVENT_METADATA } from "./constants";

export const eventHandler = (event: Class<DomainEvent>): ClassDecorator => {
  return (target: object) => {
    if (!Reflect.hasOwnMetadata(EVENT_METADATA, event)) {
      Reflect.defineMetadata(EVENT_METADATA, { id: generateId("evttype") }, event);
    }
    Reflect.defineMetadata(EVENT_HANDLER_METADATA, event, target);
  };
};
