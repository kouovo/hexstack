import type { AnyRequestDefinition } from "@millstream/cqrs/mediator";

import type { InjectionToken } from "../di";
import type { IRequestHandler } from "./mediator";

/** One use case: a command/query definition and the handler the mediator dispatches it to. */
export interface HandlerBinding<D extends AnyRequestDefinition = AnyRequestDefinition> {
  readonly definition: D;
  readonly handler: InjectionToken<IRequestHandler<D>>;
}

export function handle<D extends AnyRequestDefinition>(definition: D, handler: InjectionToken<IRequestHandler<D>>): HandlerBinding<D> {
  return { definition, handler };
}
