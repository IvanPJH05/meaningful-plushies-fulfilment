import IORedis from "ioredis";
import { getCrmServerEnv } from "../../shared/validation/env.ts";

let redisClient: IORedis | undefined;

export function getRedisClient(): IORedis {
  if (!redisClient) {
    const env = getCrmServerEnv();
    redisClient = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return redisClient;
}
