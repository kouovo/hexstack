import { container } from "@app/common/di";
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from "@app/common/storage";

let registration: Promise<void> | undefined;

/** Like the migration CLI's lazy loader: storage commands do not require Postgres/Redis bootstrap. */
export async function loadObjectStorage(): Promise<ObjectStoragePort> {
  registration ??= import("@app/common/storage/adapters").then(({ registerObjectStorage }) => registerObjectStorage());
  await registration;
  return container.resolve<ObjectStoragePort>(OBJECT_STORAGE_PORT);
}
