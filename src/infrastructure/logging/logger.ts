import pino from "pino";

export const logger = pino({
  name: "meaningful-plushies-crm",
  level: process.env.LOG_LEVEL || "info",
  redact: [
    "req.headers.authorization",
    "accessToken",
    "encryptedAccessToken",
    "password",
    "passwordHash",
  ],
});
