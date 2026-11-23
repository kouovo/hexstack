import { ORPCError } from "@orpc/server";

import { HTTP_STATUS } from "../errors/public-error";
import { resolvePublicErrorCatalog } from "../errors/public-error-catalog";
import { createLogger } from "../logger";

const logger = createLogger("rpc-errors");

/** oRPC transport categories only. Application failures are identified exclusively by data._tag. */
const RPC_CATEGORY = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_CONTENT",
  423: "LOCKED",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
  501: "NOT_IMPLEMENTED",
  503: "SERVICE_UNAVAILABLE",
} as const;

export async function handleRpcErrors<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    // Framework-owned errors retain oRPC's protocol, not an application error-code compatibility path.
    if (error instanceof ORPCError) throw error;
    const catalog = resolvePublicErrorCatalog();
    if (catalog.isKnown(error)) {
      const { _tag, message, metadata } = catalog.project(error);
      const status = HTTP_STATUS[error.kind];
      throw new ORPCError(RPC_CATEGORY[status], {
        status,
        message,
        data: { _tag, ...(metadata === undefined ? {} : { metadata }) },
        cause: error,
      });
    }
    logger.error({ err: error }, "unhandled RPC error");
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Something went wrong on our side. Please try again.",
      data: { _tag: "InternalError" },
      cause: error,
    });
  }
}
