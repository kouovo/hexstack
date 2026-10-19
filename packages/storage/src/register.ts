import { OBJECT_STORAGE_PORT } from "@app/application";
import { container, instanceCachingFactory } from "@app/di";
import { env } from "@app/env";

import { LocalObjectStorageAdapter } from "./local-object-storage.adapter";
import { MinioObjectStorageAdapter } from "./minio-object-storage.adapter";

export function registerObjectStorage(): void {
  container.register(OBJECT_STORAGE_PORT, {
    // Lazy: an unconfigured S3 driver must not break unrelated API routes, tests or builds.
    useFactory: instanceCachingFactory(() => {
      if (env.STORAGE_DRIVER === "local")
        return new LocalObjectStorageAdapter({ bucket: env.STORAGE_BUCKET, rootDir: env.STORAGE_LOCAL_ROOT });
      const accessKey = env.STORAGE_MINIO_ACCESS_KEY;
      const secretKey = env.STORAGE_MINIO_SECRET_KEY;
      if (!accessKey || !secretKey)
        throw new Error("STORAGE_MINIO_ACCESS_KEY and STORAGE_MINIO_SECRET_KEY are required for the minio driver");
      return new MinioObjectStorageAdapter({
        accessKey,
        secretKey,
        bucket: env.STORAGE_BUCKET,
        endPoint: env.STORAGE_MINIO_ENDPOINT,
        region: env.STORAGE_MINIO_REGION,
        useSSL: env.STORAGE_MINIO_USE_SSL,
      });
    }),
  });
}
