import { createLogger, type ILogger } from "@app/logger";

import pkg from "../../package.json";

export const appLogger: ILogger = createLogger(pkg.name);
