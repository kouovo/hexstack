import { registerApplicationJobs, registerDomainCqrsHandlers } from "@app/application";
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
  enableWorkers?: boolean;
};

/** Order matters: ports first, then the handlers that inject them. */
export function registerDI({ enableWorkers = true }: RegisterDIOptions = {}): void {
  registerRequestContext();

  registerDBClient();
  registerSqlQueryBuilder();
  registerTransactionManager();
  registerApplicationTransactionPort();
  registerRepositories();

  registerRedis();
  registerAuth();
  registerCache();
  registerObjectStorage();
  registerPubSub();
  registerQueue({ enableWorkers });

  registerDomainCqrsHandlers();
  registerApplicationJobs();
}
