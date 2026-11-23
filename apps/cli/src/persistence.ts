export type PersistenceModule = typeof import("@app/common/db");

let persistence: Promise<PersistenceModule> | undefined;

export function loadPersistence(): Promise<PersistenceModule> {
  persistence ??= import("@app/common/db");
  return persistence;
}
