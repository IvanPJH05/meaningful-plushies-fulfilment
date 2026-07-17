import { logger } from "../../src/infrastructure/logging/logger.ts";
import { CRM_QUEUE_NAMES } from "../../src/infrastructure/queue/bullmq.ts";

logger.info(
  {
    queues: CRM_QUEUE_NAMES,
  },
  "CRM worker placeholder started. Phase 1 only creates queue foundations; processors start in Phase 2.",
);
