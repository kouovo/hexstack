import "reflect-metadata";
import { generateId } from "@app/core";
import type { Class } from "type-fest";

import type { Query } from "../query-bus";
import { QUERY_HANDLER_METADATA, QUERY_METADATA } from "./constants";

export const queryHandler = (query: Class<Query>): ClassDecorator => {
  return (target: object) => {
    if (!Reflect.hasOwnMetadata(QUERY_METADATA, query)) {
      Reflect.defineMetadata(QUERY_METADATA, { id: generateId("qrytype") }, query);
    }
    Reflect.defineMetadata(QUERY_HANDLER_METADATA, query, target);
  };
};
