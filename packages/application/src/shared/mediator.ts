import { type DependencyContainer, inject, type InjectionToken } from "@app/di";
import type { AnyRequestDefinition, Mediator, RequestPayload, RequestResult } from "@millstream/cqrs/mediator";

export {
  defineCommand,
  defineQuery,
  HandlerNotFoundError,
  InvalidRequestError,
  Mediator,
  type MediatorMiddleware,
  type RequestInput,
  type RequestPayload,
  type RequestResult,
} from "@millstream/cqrs/mediator";

export const MEDIATOR = Symbol.for("MEDIATOR");
export const injectMediator = () => inject(MEDIATOR);

/** Receives the schema-validated payload. */
export interface IRequestHandler<D extends AnyRequestDefinition> {
  execute(input: RequestPayload<D>): Promise<RequestResult<D>>;
}

/** Resolves the handler now, so missing dependencies fail at startup. */
export function bindHandler<D extends AnyRequestDefinition>(
  mediator: Mediator,
  container: DependencyContainer,
  definition: D,
  handler: InjectionToken<IRequestHandler<D>>,
): Mediator {
  const instance = container.resolve(handler);
  return mediator.handle(definition, (input) => instance.execute(input));
}
