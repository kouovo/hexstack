import {
  registerApplicationJobs,
  registerApplicationOutboxHandlers,
  registerCacheInvalidation,
  registerDomainCqrsHandlers,
} from "@app/application";
import { registerAuth } from "@app/auth";
import { registerCache } from "@app/cache";
import { registerRequestContext } from "@app/context";
import {
  registerApplicationTransactionPort,
  registerDBClient,
  registerRepositories,
  registerSqlQueryBuilder,
  registerTransactionManager,
} from "@app/persistence";
import { registerPubSub } from "@app/pubsub";
import { registerQueue } from "@app/queue";
import { registerRedis } from "@app/redis";
import { registerObjectStorage } from "@app/storage";

export type RegisterDIOptions = {
  /** Register BullMQ workers for a long-running process. */
  enableWorkers?: boolean;
};

/**
 * The transport-independent composition root. Order matters:
 * infrastructure ports first, then handlers that inject them.
 */
export function registerDI({ enableWorkers = true }: RegisterDIOptions = {}): void {
  registerRequestContext();

  registerDBClient();
  registerSqlQueryBuilder();
  registerTransactionManager();
  registerApplicationTransactionPort();
  registerRepositories();

  registerRedis();
  registerAuth(); // password hasher + rate limiter; before the handlers that inject them
  registerCache(); // LOCK + CACHE
  registerObjectStorage();
  registerPubSub();
  registerQueue({ enableWorkers });

  registerDomainCqrsHandlers();
  registerCacheInvalidation(); // global after-commit event handler; needs CACHE
  registerApplicationOutboxHandlers();
  registerApplicationJobs();
}
