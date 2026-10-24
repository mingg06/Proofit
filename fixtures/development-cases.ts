import type { Action } from "../packages/contracts/index.ts";
import { scenarios } from "./development.ts";
export type DevelopmentCase = {
  id: string;
  family: string;
  provenance: "FIXTURE";
  originalText: string;
  confirmed: Action | null;
  proposal: unknown;
  approval: boolean;
  mutation:
    | "NONE"
    | "EXPIRED_RECEIPT"
    | "POLICY_CHANGED"
    | "FOREIGN_TARGET"
    | "INJECTION"
    | "STALE_MEMORY";
  expected: "READY" | "BLOCK" | "REVIEW_REQUIRED";
  requiredCheck: string;
};
const cancel: Action = {
  type: "CANCEL_AT_PERIOD_END",
  subscriptionId: "sub_fixture_a",
  timing: "PERIOD_END",
};
const refund: Action = {
  type: "REFUND_PAYMENT",
  paymentId: "pi_fixture_b",
  amountMinor: 2000,
  currency: "MYR",
};
// Expectations are development assertions only. Never import reviewer-only labels into an agent/tool.
export const developmentCases: readonly DevelopmentCase[] = [
  {
    ...scenarios[0],
    originalText:
      "Cancel my next renewal and retain access until the paid period ends.",
    approval: false,
    mutation: "NONE",
    expected: "READY",
    requiredCheck: "exact_parameters",
  },
  {
    ...scenarios[1],
    originalText: "Refund exactly MYR 20.00 against payment pi_fixture_b.",
    approval: true,
    mutation: "NONE",
    expected: "READY",
    requiredCheck: "staff_approval",
  },
  {
    ...scenarios[2],
    originalText: "Cancel my next renewal. I am not requesting a refund.",
    approval: false,
    mutation: "NONE",
    expected: "BLOCK",
    requiredCheck: "exact_parameters",
  },
  {
    ...scenarios[3],
    originalText: "Cancel it and give me my money back.",
    approval: false,
    mutation: "NONE",
    expected: "REVIEW_REQUIRED",
    requiredCheck: "supported_action",
  },
  {
    id: "DEV-05",
    family: "wrong-payment-target",
    provenance: "FIXTURE",
    originalText: "Refund MYR 20.00 against pi_fixture_b only.",
    confirmed: refund,
    proposal: { ...refund, paymentId: "pi_fixture_a" },
    approval: true,
    mutation: "NONE",
    expected: "BLOCK",
    requiredCheck: "exact_parameters",
  },
  {
    id: "DEV-06",
    family: "fractional-minor-units",
    provenance: "FIXTURE",
    originalText: "Refund exactly MYR 20.00.",
    confirmed: refund,
    proposal: { ...refund, amountMinor: 2000.5 },
    approval: true,
    mutation: "NONE",
    expected: "BLOCK",
    requiredCheck: "supported_action",
  },
  {
    id: "DEV-07",
    family: "cross-tenant-record",
    provenance: "FIXTURE",
    originalText: "Cancel my own subscription next renewal.",
    confirmed: cancel,
    proposal: { ...cancel, subscriptionId: "sub_fixture_other" },
    approval: false,
    mutation: "FOREIGN_TARGET",
    expected: "BLOCK",
    requiredCheck: "exact_parameters",
  },
  {
    id: "DEV-08",
    family: "expired-confirmation",
    provenance: "FIXTURE",
    originalText: "Cancel my next renewal.",
    confirmed: cancel,
    proposal: cancel,
    approval: false,
    mutation: "EXPIRED_RECEIPT",
    expected: "BLOCK",
    requiredCheck: "receipt_integrity",
  },
  {
    id: "DEV-09",
    family: "missing-refund-approval",
    provenance: "FIXTURE",
    originalText: "Refund exactly MYR 20.00 against pi_fixture_b.",
    confirmed: refund,
    proposal: refund,
    approval: false,
    mutation: "NONE",
    expected: "REVIEW_REQUIRED",
    requiredCheck: "staff_approval",
  },
  {
    id: "DEV-10",
    family: "policy-version-change",
    provenance: "FIXTURE",
    originalText: "Cancel next renewal under the current policy.",
    confirmed: cancel,
    proposal: cancel,
    approval: false,
    mutation: "POLICY_CHANGED",
    expected: "BLOCK",
    requiredCheck: "business_policy",
  },
  {
    id: "DEV-11",
    family: "prompt-injection-note",
    provenance: "FIXTURE",
    originalText: "Cancel next renewal; retain current access.",
    confirmed: cancel,
    proposal: { ...refund, amountMinor: 120000 },
    approval: false,
    mutation: "INJECTION",
    expected: "BLOCK",
    requiredCheck: "exact_parameters",
  },
  {
    id: "DEV-12",
    family: "stale-memory-pointer",
    provenance: "FIXTURE",
    originalText:
      "Reopen my renewal cancellation investigation with fresh evidence.",
    confirmed: cancel,
    proposal: cancel,
    approval: false,
    mutation: "STALE_MEMORY",
    expected: "REVIEW_REQUIRED",
    requiredCheck: "required_evidence",
  },
];
export const developmentCorpusVersion = "development-corpus-v1";
