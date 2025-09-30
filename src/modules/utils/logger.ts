export const loggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty" } }
    : {}),
};