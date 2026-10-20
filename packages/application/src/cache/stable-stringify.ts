/** JSON with object keys sorted recursively: equal inputs always produce the same cache key. Arrays keep their order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as object)
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}
