import type { DomainEvent } from "@app/core";
import type { IEventHandler } from "@app/cqrs";
import { singleton } from "@app/di";
import { createLogger } from "@app/logger";

import { type CachePort, injectCache } from "../cache.port";

export type CacheInvalidation = { readonly kind: "delete"; readonly key: string } | { readonly kind: "bump"; readonly namespace: string };

export type DeriveCacheInvalidations = (event: DomainEvent) => readonly CacheInvalidation[];

/**
 * One global in-process handler; each bounded context registers derivers (`registerXCacheInvalidation`).
 * The event bus publishes only after commit, so a rolled-back write never invalidates.
 * Invalidation is best-effort: failures are logged and never fail the committed write; entries expire by TTL.
 */
@singleton()
export class CacheInvalidationEventsHandler implements IEventHandler<DomainEvent, void> {
  private readonly logger = createLogger(CacheInvalidationEventsHandler.name);
  private readonly rules = new Map<string, DeriveCacheInvalidations[]>();

  constructor(@injectCache() private readonly cache: CachePort) {}

  register(eventType: string, derive: DeriveCacheInvalidations): void {
    const existing = this.rules.get(eventType);
    if (existing) {
      existing.push(derive);
      return;
    }
    this.rules.set(eventType, [derive]);
  }

  async handle(event: DomainEvent): Promise<void> {
    const derivers = this.rules.get(event.eventType);
    if (!derivers?.length) return;

    const invalidations: CacheInvalidation[] = [];
    for (const derive of derivers) {
      try {
        invalidations.push(...derive(event));
      } catch (err) {
        this.logger.error({ err, eventType: event.eventType }, "cache invalidation deriver threw");
      }
    }

    await Promise.allSettled(dedupe(invalidations).map((inv) => this.apply(inv)));
  }

  private async apply(inv: CacheInvalidation): Promise<void> {
    try {
      if (inv.kind === "delete") {
        await this.cache.delete(inv.key);
      } else {
        await this.cache.bumpVersion(inv.namespace);
      }
    } catch (err) {
      this.logger.error({ err, invalidation: inv }, "cache invalidation step failed");
    }
  }
}

function dedupe(invalidations: readonly CacheInvalidation[]): CacheInvalidation[] {
  const seen = new Set<string>();
  return invalidations.filter((inv) => {
    const id = inv.kind === "delete" ? `delete:${inv.key}` : `bump:${inv.namespace}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
