import { identityContext } from "@app/identity";
import { todoContext } from "@app/todo";

/** The bounded contexts this process serves. Add a context here and to the router in @app/api-contract. */
export const CONTEXTS = [identityContext, todoContext];
