import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from "@app/application";
import { container } from "@app/di";

let registration: Promise<void> | undefined;

/** Like the migration CLI's lazy loader: storage commands do not require Postgres/Redis bootstrap. */
export async function loadObjectStorage(): Promise<ObjectStoragePort> {
  registration ??= import("@app/storage").then(({ registerObjectStorage }) => registerObjectStorage());
  await registration;
  return container.resolve<ObjectStoragePort>(OBJECT_STORAGE_PORT);
}
