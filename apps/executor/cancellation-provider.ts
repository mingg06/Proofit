import type { Action } from '../../packages/contracts/index.ts';
export type CancellationTarget={tenantId:string;customerId:string;subscriptionId:string};
export interface CancellationProvider {
 read(input:{tenantId:string;customerId:string;action:Action},signal:AbortSignal):Promise<unknown>;
 submitCancellation(input:CancellationTarget & {idempotencyKey:string},signal:AbortSignal):Promise<{providerObjectId:string;providerRequestId:string|null}>;
 observeCancellation(input:CancellationTarget,signal:AbortSignal):Promise<unknown>;
}
