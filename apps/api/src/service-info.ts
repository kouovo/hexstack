import pkg from "../package.json";

/** Shared by the OTel resource and the HTTP middleware. `OTEL_SERVICE_NAME` wins, as per the OTel spec. */
export const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "api";
export const SERVICE_VERSION = pkg.version;
