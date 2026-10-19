import { createHash } from "node:crypto";

import type { RateLimiter, RateLimitPolicy } from "@app/application";
import { singleton } from "@app/di";
import { RateLimiterUnavailableError } from "@app/domain";
import { createLogger } from "@app/logger";
import { type Redis, injectRedisClient } from "@app/redis";

/**
 * Token bucket, atomic in one Lua call so concurrent requests on any replica cannot over-spend.
 * State: hash {tokens, ts}. One token refills per interval, capped at capacity.
 * Time comes from Redis (TIME) so replicas with skewed clocks agree.
 */
const TOKEN_BUCKET = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_ms = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
local refilled = math.floor((now - ts) / refill_ms)
if refilled > 0 then
  tokens = math.min(capacity, tokens + refilled)
  ts = ts + refilled * refill_ms
end
if tokens >= capacity then ts = now end
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HSET', key, 'tokens', tokens, 'ts', ts)
redis.call('PEXPIRE', key, capacity * refill_ms)
return allowed
`;

@singleton()
export class RedisTokenBucketRateLimiter implements RateLimiter {
  private readonly logger = createLogger(RedisTokenBucketRateLimiter.name);

  constructor(@injectRedisClient() private readonly redis: Redis) {}

  async consume(policy: RateLimitPolicy, key: string): Promise<boolean> {
    // No raw email addresses / client IPs in Redis keys (the hash is a bucket key, not anonymisation).
    const bucket = createHash("sha256").update(key).digest("hex");
    try {
      const allowed = await this.redis.eval(
        TOKEN_BUCKET,
        1,
        `rate-limit:${policy.name}:${bucket}`,
        policy.capacity,
        policy.refillIntervalMs,
      );
      return allowed === 1;
    } catch (cause) {
      this.logger.error({ err: cause, policy: policy.name }, "rate limiter unavailable; failing closed");
      throw new RateLimiterUnavailableError({ policy: policy.name, cause });
    }
  }
}
