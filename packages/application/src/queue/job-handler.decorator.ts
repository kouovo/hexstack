import "@app/di";
import type { RegisterJobOptions } from "./queue.port";

const JOB_HANDLER_METADATA = Symbol("JOB_HANDLER_METADATA");

export interface JobHandlerMetadata {
  name: string;
  method: string | symbol;
  options: RegisterJobOptions;
}

/** Marks a class's process method, or an explicitly decorated method, as an MQ consumer. */
export function jobHandler(name: string, options: RegisterJobOptions = {}): ClassDecorator & MethodDecorator {
  return (target: object, propertyKey?: string | symbol): void => {
    const handler = propertyKey === undefined ? target : target.constructor;
    const registrations = getJobHandlerMetadata(handler);
    Reflect.defineMetadata(
      JOB_HANDLER_METADATA,
      [...registrations, { name, method: propertyKey ?? "process", options: { ...options } }],
      handler,
    );
  };
}

export function getJobHandlerMetadata(handler: object): readonly JobHandlerMetadata[] {
  return Reflect.getOwnMetadata(JOB_HANDLER_METADATA, handler) ?? [];
}
