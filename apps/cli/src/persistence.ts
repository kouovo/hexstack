export type PersistenceModule = typeof import("@app/persistence");

let persistence: Promise<PersistenceModule> | undefined;

export function loadPersistence(): Promise<PersistenceModule> {
  persistence ??= import("@app/persistence");
  return persistence;
}
