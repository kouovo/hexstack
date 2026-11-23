import { createLogger, type ILogger } from "@app/common/logger";

import pkg from "../../package.json";

export const appLogger: ILogger = createLogger(pkg.name);
