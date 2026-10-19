import { AsyncLocalStorage } from "node:async_hooks";

import { container, inject, singleton } from "@app/di";

/** The authenticated caller, resolved from the session by the HTTP layer. */
export interface RequestPrincipal {
  userId: string;
  sessionId: string;
  role: string;
}

/** Per-request state carried through async calls. */
export interface RequestContextState {
  requestId: string;
  /** Remote address of the client, set by the HTTP layer; used as the rate-limit key for anonymous calls. */
  clientAddress?: string;
  principal?: RequestPrincipal;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextState>();

export interface IRequestContext {
  getRequestId(): string | undefined;
  getPrincipal(): RequestPrincipal | undefined;
  getClientAddress(): string | undefined;
}

@singleton()
export class RequestContext implements IRequestContext {
  getRequestId(): string | undefined {
    return requestContextStorage.getStore()?.requestId;
  }

  getPrincipal(): RequestPrincipal | undefined {
    return requestContextStorage.getStore()?.principal;
  }

  getClientAddress(): string | undefined {
    return requestContextStorage.getStore()?.clientAddress;
  }
}

export const REQUEST_CONTEXT = Symbol.for("REQUEST_CONTEXT");
export const injectRequestContext = () => inject(REQUEST_CONTEXT);

export function registerRequestContext() {
  if (!container.isRegistered(REQUEST_CONTEXT)) {
    container.register<IRequestContext>(REQUEST_CONTEXT, { useClass: RequestContext });
  }
}
