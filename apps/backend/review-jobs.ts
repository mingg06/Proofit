import { randomUUID } from "node:crypto";
import type { Store } from "./database.ts";
import { receiptSchema } from "../../packages/contracts/index.ts";
import type { z } from "zod";
type Receipt = z.infer<typeof receiptSchema>;
export function enqueueReview(
  store: Store,
  receipt: Receipt,
  now: Date,
  available: boolean,
) {
  const b = receipt.binding;
  store.run(
    "INSERT OR IGNORE INTO review_jobs(id,tenant_id,customer_id,request_id,request_version,receipt_id,status,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    randomUUID(),
    b.tenantId,
    b.customerId,
    b.requestId,
    b.requestVersion,
    receipt.receiptId,
    available ? "QUEUED" : "UNAVAILABLE",
    available
      ? "Waiting for automatic investigation."
      : "Automatic investigation is unavailable until integrations are configured and verified.",
    now.toISOString(),
    now.toISOString(),
  );
}
