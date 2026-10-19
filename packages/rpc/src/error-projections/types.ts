import type { KnownError } from "@app/domain";

export interface PublicError {
  _tag: KnownError["_tag"] | "InternalError" | "HttpError";
  message: string;
  metadata?: Record<string, unknown>;
}

/** Each projector accepts only its own error variant and must preserve that variant's tag. */
export type PublicErrorMap<E extends KnownError> = {
  [Tag in E["_tag"]]: (error: Extract<E, { _tag: Tag }>) => PublicError & { _tag: Tag };
};
