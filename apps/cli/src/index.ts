#!/usr/bin/env node
import "reflect-metadata";
import { createCli } from "./create-cli";
import { createCliServices } from "./services";

const exitCode = await createCli().run(process.argv.slice(2), { services: createCliServices() });
process.exit(exitCode);
