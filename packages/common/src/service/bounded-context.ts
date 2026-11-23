import type { HandlerBinding } from "../cqrs/handler-binding";
import type { DependencyContainer } from "../di";
import type { PublicErrorMap } from "../errors/public-error";
import type { EventSubscriptions } from "../events/subscriptions";

/**
 * What a bounded context contributes to a process. The composition root (`registerDI`) wires every context the
 * same way, so adding a context never edits common code.
 */
export interface BoundedContext {
  readonly name: string;
  /** Outbound adapters for the context's ports (repositories, external services). Tests replace them with fakes. */
  registerAdapters?(container: DependencyContainer): void;
  /** Services the context provides to the process regardless of the adapters in use (e.g. an authorization policy). */
  registerServices?(container: DependencyContainer): void;
  /** The commands and queries the mediator serves. */
  readonly handlers?: readonly HandlerBinding<any>[];
  /** Event handlers, in-process and outbox. */
  readonly subscriptions?: Partial<EventSubscriptions>;
  /** Public projections of the context's errors. */
  readonly publicErrors?: PublicErrorMap<any>;
}
