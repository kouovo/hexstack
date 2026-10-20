/** Spreads expiry (±`jitterRatio`) so entries filled together do not all expire, and reload, in the same instant. */
export function jitteredTtlSeconds(baseSeconds: number, jitterRatio = 0.1): number {
  const spread = baseSeconds * jitterRatio;
  return Math.max(1, Math.round(baseSeconds + (Math.random() * 2 - 1) * spread));
}
