import { DomainError } from "../ddd/domain-error";
import { container } from "../di";
import type { PublicError, PublicErrorMap } from "./public-error";

type Projector = (error: DomainError) => PublicError;

/**
 * Public exposure is an explicit allowlist, never inferred from kind or the developer message. Each bounded context
 * contributes the projections for its own errors; an error without one is reported as an internal error.
 */
export class PublicErrorCatalog {
  private readonly projectors = new Map<string, Projector>();

  constructor(maps: readonly PublicErrorMap<any>[]) {
    for (const map of maps) {
      for (const [tag, projector] of Object.entries(map)) {
        if (this.projectors.has(tag)) throw new Error(`Public error projection already registered: ${tag}`);
        this.projectors.set(tag, projector as Projector);
      }
    }
  }

  isKnown(error: unknown): error is DomainError {
    return error instanceof DomainError && this.projectors.has(error._tag);
  }

  /** Explicit public projection; never spread an error's fields or expose its kind/cause/stack. */
  project(error: DomainError): PublicError {
    const projector = this.projectors.get(error._tag);
    if (!projector) throw new Error(`No public projection for ${error._tag}`);
    return projector(error);
  }
}

export const PUBLIC_ERROR_CATALOG = Symbol.for("PUBLIC_ERROR_CATALOG");

export function resolvePublicErrorCatalog(): PublicErrorCatalog {
  return container.resolve<PublicErrorCatalog>(PUBLIC_ERROR_CATALOG);
}
