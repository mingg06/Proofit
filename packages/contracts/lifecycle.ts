import type { OperationState } from './index.ts';
const transitions: Record<OperationState, readonly OperationState[]> = {
  RESERVED: ['SUBMITTED', 'FAILED', 'CANCELED'],
  SUBMITTED: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'OUTCOME_UNKNOWN'],
  PENDING: ['SUCCEEDED', 'FAILED', 'CANCELED', 'OUTCOME_UNKNOWN'],
  OUTCOME_UNKNOWN: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED'],
  SUCCEEDED: [], FAILED: [], CANCELED: [],
};
export function assertTransition(from: OperationState, to: OperationState): void {
  if (!transitions[from].includes(to)) throw new Error('Illegal operation transition: ' + from + ' -> ' + to);
}
// These transitions describe recorded observations; they do not permit provider submission.
// Reconciliation of OUTCOME_UNKNOWN retains the same operation/key. No blind resubmission.
