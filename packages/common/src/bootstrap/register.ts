import { registerCache } from "../cache/redis/register";
import { registerRequestContext } from "../context/request-context";
import { bindHandler, MEDIATOR, Mediator } from "../cqrs/mediator";
import { registerDatabase } from "../db/register";
import { container } from "../di";
import { COMMON_PUBLIC_ERRORS } from "../errors/common.public-errors";
import { PUBLIC_ERROR_CATALOG, PublicErrorCatalog } from "../errors/public-error-catalog";
import { createInProcessEventBus } from "../events/in-process-event-bus";
import { registerPubSub } from "../events/millstream/register";
import { registerOutboxWorkers } from "../events/outbox-workers";
import { DOMAIN_EVENT_BUS } from "../events/port";
import {
  EVENT_SUBSCRIPTIONS,
  type EventSubscriptions,
  mergeEventSubscriptions,
  OUTBOX_EVENT_NAMES,
  outboxEventNames,
} from "../events/subscriptions";
import { registerQueue } from "../queue/bullmq/register";
import { JOB_DISPATCHER, type JobDispatcher } from "../queue/queue.port";
import { registerRedis } from "../redis/register";
import type { BoundedContext } from "../service/bounded-context";
import { registerObjectStorage } from "../storage/adapters/register";
import { STORAGE_PUBLIC_ERRORS } from "../storage/storage.public-errors";

export type RegisterDIOptions = {
  contexts: readonly BoundedContext[];
  /** Start BullMQ workers in this process. The CLI turns them off. */
  enableWorkers?: boolean;
};

/** Shared infrastructure: database, Redis, cache, storage, queue and the outbox relay. */
export function registerInfrastructure({ enableWorkers = true }: Pick<RegisterDIOptions, "enableWorkers"> = {}): void {
  registerRequestContext();
  registerDatabase();
  registerRedis();
  registerCache();
  registerObjectStorage();
  registerPubSub();
  registerQueue({ enableWorkers });
}

/**
 * The application layer of every context: public errors, event subscriptions, the in-process event bus and the
 * mediator. Needs the ports its handlers inject, so register adapters (or test fakes) first.
 */
export function registerApplication(contexts: readonly BoundedContext[]): void {
  registerRequestContext();
  container.registerInstance(
    PUBLIC_ERROR_CATALOG,
    new PublicErrorCatalog([
      COMMON_PUBLIC_ERRORS,
      STORAGE_PUBLIC_ERRORS,
      ...contexts.flatMap(({ publicErrors }) => (publicErrors ? [publicErrors] : [])),
    ]),
  );

  const subscriptions = mergeEventSubscriptions(contexts.map((context) => context.subscriptions ?? {}));
  container.registerInstance(EVENT_SUBSCRIPTIONS, subscriptions);
  container.registerInstance(OUTBOX_EVENT_NAMES, outboxEventNames(subscriptions));

  for (const context of contexts) context.registerServices?.(container);

  const { bus } = createInProcessEventBus(subscriptions.inProcess, (handler) => container.resolve(handler));
  container.registerInstance(DOMAIN_EVENT_BUS, bus);

  const mediator = new Mediator();
  for (const { handlers = [] } of contexts) {
    for (const { definition, handler } of handlers) bindHandler(mediator, container, definition, handler);
  }
  container.registerInstance(MEDIATOR, mediator);
}

/** One BullMQ worker per outbox subscription. Resolving a handler never starts workers by itself. */
export function registerJobs(): void {
  const { outbox } = container.resolve<EventSubscriptions>(EVENT_SUBSCRIPTIONS);
  registerOutboxWorkers(outbox, container.resolve<JobDispatcher>(JOB_DISPATCHER), (handler) => container.resolve(handler));
}

/** The whole process. Order matters: infrastructure, then context adapters, then the handlers that inject them. */
export function registerDI({ contexts, enableWorkers = true }: RegisterDIOptions): void {
  registerInfrastructure({ enableWorkers });
  for (const context of contexts) context.registerAdapters?.(container);
  registerApplication(contexts);
  registerJobs();
}
