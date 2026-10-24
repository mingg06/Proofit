import { randomUUID } from "node:crypto";
import { measuredUsageSchema } from "../../packages/contracts/investigation.ts";
import { Foundation } from "./foundation.ts";
import { Investigator } from "../investigator/runner.ts";
import { HttpError } from "./auth.ts";
import { OperationLedger } from "./operations.ts";
type Job = {
  id: string;
  tenant_id: string;
  customer_id: string;
  request_id: string;
  request_version: number;
  receipt_id: string;
  proposal_id: string | null;
};
export interface ProposingModel {
  readonly provenance: "LIVE" | "CONTROLLED_TEST";
  readonly modelId: string;
  propose(
    context: unknown,
    signal: AbortSignal,
  ): Promise<{ proposal: unknown; usage: unknown }>;
}
export interface ExecutionService {
  execute(reference: {
    validationId: string;
  }): Promise<{ operationId: string }>;
}
/** Server-owned orchestration. Human authority, eligibility and operation identity stay in existing services. */
export class ReviewPipeline {
  readonly foundation: Foundation;
  readonly investigator: Investigator;
  readonly proposer: ProposingModel;
  readonly execution: ExecutionService | undefined;
  constructor(
    foundation: Foundation,
    investigator: Investigator,
    proposer: ProposingModel,
    execution?: ExecutionService,
  ) {
    if (investigator.gateway.store !== foundation.store)
      throw new Error("Pipeline must share the authoritative store");
    this.foundation = foundation;
    this.investigator = investigator;
    this.proposer = proposer;
    this.execution = execution;
  }
  async runNext(staffToken: string) {
    const f = this.foundation,
      g = this.investigator.gateway,
      claim = randomUUID();
    const job = f.store.transaction(() => {
      const actor = f.auth.session(staffToken).actor;
      g.staff(actor);
      f.store.run(
        "UPDATE review_jobs SET status='QUEUED',message='Verified worker available; waiting for investigation.',updated_at=? WHERE tenant_id=? AND status='UNAVAILABLE' AND receipt_id IN(SELECT id FROM receipts WHERE expires_at>? AND consumed_by_operation_id IS NULL)",
        f.now().toISOString(),
        actor.tenant_id,
        f.now().toISOString(),
      );
      // A crashed orchestration is held, never restarted as an untracked provider attempt.
      f.store.run(
        "UPDATE review_jobs SET status='REVIEW_REQUIRED',message='Prior worker stopped; inspect recorded investigation and operation before resuming.',lease_token=NULL,lease_until=NULL,updated_at=? WHERE tenant_id=? AND status='INVESTIGATING' AND lease_until<=?",
        f.now().toISOString(),
        actor.tenant_id,
        f.now().toISOString(),
      );
      const row = f.store.get<Job>(
        "SELECT * FROM review_jobs WHERE tenant_id=? AND status='QUEUED' ORDER BY created_at,id LIMIT 1",
        actor.tenant_id,
      );
      if (!row) return null;
      const current = f.readCase(
        staffToken,
        row.request_id,
        row.request_version,
      );
      if (
        current.latestVersion !== row.request_version ||
        current.receipt?.receiptId !== row.receipt_id
      ) {
        f.store.run(
          "UPDATE review_jobs SET status='REVIEW_REQUIRED',message='Request or confirmation changed.',updated_at=? WHERE id=?",
          f.now().toISOString(),
          row.id,
        );
        return null;
      }
      f.store.run(
        "UPDATE review_jobs SET status='INVESTIGATING',lease_token=?,lease_until=?,message='Investigating recorded evidence.',updated_at=? WHERE id=? AND status='QUEUED'",
        claim,
        new Date(f.now().getTime() + 120000).toISOString(),
        f.now().toISOString(),
        row.id,
      );
      return row;
    });
    if (!job) return null;
    const update = (
      status: string,
      message: string,
      fields: {
        proposalId?: string;
        runId?: string;
        validationId?: string;
        operationId?: string;
      } = {},
    ) =>
      f.store.run(
        "UPDATE review_jobs SET status=?,message=?,proposal_id=COALESCE(?,proposal_id),run_id=COALESCE(?,run_id),validation_id=COALESCE(?,validation_id),operation_id=COALESCE(?,operation_id),updated_at=?,lease_token=CASE WHEN ? THEN NULL ELSE lease_token END,lease_until=CASE WHEN ? THEN NULL ELSE lease_until END WHERE id=? AND lease_token=?",
        status,
        message,
        fields.proposalId ?? null,
        fields.runId ?? null,
        fields.validationId ?? null,
        fields.operationId ?? null,
        f.now().toISOString(),
        status !== "INVESTIGATING" ? 1 : 0,
        status !== "INVESTIGATING" ? 1 : 0,
        job.id,
        claim,
      );
    const current = () => {
      const row = f.store.get(
        "SELECT id FROM review_jobs WHERE id=? AND lease_token=? AND lease_until>?",
        job.id,
        claim,
        f.now().toISOString(),
      );
      if (!row) throw new HttpError(409, "Worker lease expired");
      const data = f.readCase(staffToken, job.request_id, job.request_version);
      if (
        data.latestVersion !== job.request_version ||
        data.receipt?.receiptId !== job.receipt_id
      )
        throw new HttpError(409, "Request changed");
      return data;
    };
    try {
      let proposalId = job.proposal_id;
      if (!proposalId) {
        if (g.mode === "LIVE_TEST" && this.proposer.provenance !== "LIVE")
          throw new Error("Unverified proposing model");
        const data = current(),
          controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let result: { proposal: unknown; usage: unknown };
        try {
          result = await Promise.race([
            this.proposer.propose(
              { request: data.request, confirmedReceipt: data.receipt },
              controller.signal,
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error("Proposal budget exhausted"));
              }, 15000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        const usage = measuredUsageSchema.parse(result.usage);
        if (usage.modelId !== this.proposer.modelId)
          throw new Error("Proposer identity mismatch");
        // Foundation owns proposal persistence/audit; the worker never issues its own authority.
        current();
        proposalId = f.propose(staffToken, {
          requestId: job.request_id,
          requestVersion: job.request_version,
          proposal: result.proposal,
          conversation: JSON.stringify({
            producer: "AUTOMATED_PROPOSER",
            provenance: this.proposer.provenance,
            usage,
          }),
        }).proposalId;
        update("INVESTIGATING", "Investigating the stored AI proposal.", {
          proposalId,
        });
      }
      current();
      const run = await this.investigator.start(staffToken, { proposalId });
      current();
      const fields = {
        proposalId,
        runId: run.run.id,
        validationId: run.validation.validationId,
      };
      if (run.validation.decision !== "READY") {
        update(
          run.validation.decision === "BLOCK" ? "BLOCKED" : "REVIEW_REQUIRED",
          "Backend " +
            run.validation.decision +
            ". Inspect recorded checks and unresolved issues.",
          fields,
        );
      } else if (!this.execution) {
        update(
          "READY",
          "Exact action is eligible; provider submission is disabled.",
          fields,
        );
      } else {
        current();
        const submitted = await this.execution.execute({
          validationId: run.validation.validationId,
        });
        const op = new OperationLedger(g).get(
          staffToken,
          submitted.operationId,
        );
        if (
          op.requestId !== job.request_id ||
          op.requestVersion !== job.request_version
        )
          throw new Error("Operation scope mismatch");
        update(
          op.effectVerified ? "OBSERVED" : "OUTCOME_UNKNOWN",
          op.statusText,
          { ...fields, operationId: op.operationId },
        );
      }
    } catch {
      update(
        "REVIEW_REQUIRED",
        "Automatic processing stopped. Inspect stored records before any fresh investigation or execution.",
      );
    }
    return f.store.get(
      "SELECT status,message,proposal_id,run_id,validation_id,operation_id FROM review_jobs WHERE id=?",
      job.id,
    );
  }
}
