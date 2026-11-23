import { identityContext } from "@app/identity";
import { todoContext } from "@app/todo";

/** The bounded contexts the CLI can reach. Keep in step with apps/api/src/contexts.ts. */
export const CONTEXTS = [identityContext, todoContext];
