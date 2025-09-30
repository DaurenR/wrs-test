const isProduction = process.env.NODE_ENV === "production";

export const loggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  ...(isProduction ? {} : { transport: { target: "pino-pretty" } }),
};
