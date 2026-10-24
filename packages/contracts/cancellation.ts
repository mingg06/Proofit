import { z } from 'zod';
import { id,timestamp } from './index.ts';
export const operationReferenceSchema=z.strictObject({operationId:id});
export const cancellationObservationSchema=z.strictObject({tenantId:id,customerId:id,targetId:id,providerObjectId:id,
 environment:z.literal('TEST'),provenance:z.enum(['LIVE','CONTROLLED_TEST']),observedAt:timestamp,
 status:z.enum(['SCHEDULED','NOT_SCHEDULED','CANCELED','UNKNOWN']),periodEnd:timestamp.nullable(),
 providerRequestId:id.nullable(),adapterVersion:id});
export type CancellationObservation=z.infer<typeof cancellationObservationSchema>;
