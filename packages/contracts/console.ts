import { z } from "zod";
import {
  receiptSchema,
  approvalSchema,
  validationSchema,
  operationStateSchema,
} from "./index.ts";
import { cancellationObservationSchema } from "./cancellation.ts";
export const actorSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  customer_id: z.string().nullable(),
  role: z.enum(["CUSTOMER", "SUPPORT", "REFUND_APPROVER"]),
});
export const sessionSchema = z.object({
  actor: actorSchema,
  csrfToken: z.string(),
});
export const requestSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  version: z.number().int(),
  customer_id: z.string(),
  actor_id: z.string(),
  original_text: z.string(),
  created_at: z.string(),
});
export const resourceSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  kind: z.enum(["PAYMENT", "SUBSCRIPTION"]),
  provenance: z.enum(["FIXTURE", "LIVE"]),
});
export const validationViewSchema = validationSchema.extend({
  mode: z.enum(["LIVE_TEST", "CONTROLLED_TEST"]),
  rulesVersion: z.string(),
  executionEnabled: z.literal(false).optional(),
});
export const caseSchema = z.object({
  request: requestSchema,
  latestVersion: z.number().int(),
  receipt: receiptSchema.nullable(),
  executionEnabled: z.literal(false),
  operations: z.array(
    z.object({
      operationId: z.string(),
      state: operationStateSchema,
      mode: z.enum(["LIVE_TEST", "CONTROLLED_TEST"]),
      createdAt: z.string(),
    }),
  ),
  proposals: z
    .array(
      z.object({
        id: z.string(),
        proposal_json: z.string(),
        conversation: z.string(),
        created_at: z.string(),
      }),
    )
    .optional(),
  approvals: z.array(approvalSchema).optional(),
  validations: z.array(validationViewSchema).optional(),
  investigations: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        mode: z.string(),
        model_id: z.string().nullable(),
        created_at: z.string(),
        validation_id: z.string().nullable(),
      }),
    )
    .optional(),
  auditEvents: z
    .array(
      z.object({
        sequence: z.number(),
        id: z.string(),
        actor_id: z.string(),
        event: z.string(),
        detail_json: z.string(),
        created_at: z.string(),
      }),
    )
    .optional(),
});
export const replaySchema = z.object({
  recordedReplay: z.literal(true),
  run: z.object({
    id: z.string(),
    status: z.string(),
    mode: z.string(),
    model_id: z.string().nullable(),
    model_turns: z.number(),
    tool_calls: z.number(),
    active_duration_ms: z.number(),
    input_tokens: z.number().nullable(),
    output_tokens: z.number().nullable(),
    unresolved_json: z.string(),
    created_at: z.string(),
    finished_at: z.string().nullable(),
  }),
  findings: z.array(
    z.object({
      kind: z.string(),
      text: z.string(),
      references_json: z.string(),
    }),
  ),
  evidence: z.array(
    z.object({ evidence_id: z.string(), record_json: z.string() }),
  ),
  events: z.array(
    z.object({
      sequence: z.number(),
      kind: z.string(),
      data_json: z.string(),
      created_at: z.string(),
    }),
  ),
});
export const operationViewSchema = z.object({
  operationId: z.string(),
  requestId: z.string(),
  requestVersion: z.number(),
  state: operationStateSchema,
  mode: z.string(),
  effectVerified: z.boolean(),
  providerObjectId: z.string().nullable(),
  statusText: z.string(),
  observation: cancellationObservationSchema.nullable(),
  executionEnabled: z.literal(false),
});
export type Actor = z.infer<typeof actorSchema>;
export type RequestRow = z.infer<typeof requestSchema>;
export type Case = z.infer<typeof caseSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type Replay = z.infer<typeof replaySchema>;
export type Validation = z.infer<typeof validationViewSchema>;
export type Operation = z.infer<typeof operationViewSchema>;
