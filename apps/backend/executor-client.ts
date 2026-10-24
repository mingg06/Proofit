import { z } from "zod";
import {
  actionSchema,
  executionInputSchema,
} from "../../packages/contracts/index.ts";
import { providerStateSchema } from "../../packages/contracts/gateway.ts";
import type { ProviderReader } from "./gateway.ts";
import type { ExecutionService } from "./review-pipeline.ts";
/** Narrow server-only client. Model output cannot select a URL, method or submission payload. */
export class ExecutorClient implements ProviderReader, ExecutionService {
  #secret: string;
  readonly origin: string;
  constructor(origin: string, secret: string) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      secret.length < 32
    )
      throw new Error("Loopback executor origin and service secret required");
    this.origin = origin;
    this.#secret = secret;
  }
  private async post(path: string, body: unknown, parent?: AbortSignal) {
    const signal = parent
      ? AbortSignal.any([parent, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000);
    try {
      const response = await fetch(this.origin + path, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          Authorization: "Bearer " + this.#secret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        throw new Error("Service rejected request");
      }
      if (!response.body) throw new Error("Missing body");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 65536) throw new Error("Oversized service response");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      signal.throwIfAborted();
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new Error(
        "Executor service response is unavailable; inspect the stored operation before retrying.",
      );
    }
  }
  async read(
    input: Parameters<ProviderReader["read"]>[0],
    signal: AbortSignal,
  ) {
    const body = z
      .strictObject({
        tenantId: z.string().min(1),
        customerId: z.string().min(1),
        action: actionSchema,
      })
      .parse(input);
    return providerStateSchema
      .nullable()
      .parse(await this.post("/internal/provider-state", body, signal));
  }
  async execute(reference: { validationId: string }) {
    return z
      .object({ operationId: z.string().min(1) })
      .parse(
        await this.post(
          "/internal/actions",
          executionInputSchema.parse(reference),
        ),
      );
  }
}
