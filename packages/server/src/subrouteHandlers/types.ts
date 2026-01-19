import type {
  FlowgladActionKey,
  flowgladActionValidators,
} from '@flowglad/shared'
import type { z } from 'zod'
import type { FlowgladServer } from '../FlowgladServer'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'

export type InferRouteHandlerParams<T extends FlowgladActionKey> = {
  method: (typeof flowgladActionValidators)[T]['method']
  data: z.infer<
    (typeof flowgladActionValidators)[T]['inputValidator']
  >
}

export type SubRouteHandler<T extends FlowgladActionKey> = (
  params: InferRouteHandlerParams<T>,
  flowgladServer: FlowgladServer
) => Promise<{
  data: {}
  status: number
  error?: {
    code: string
    json: Record<string, unknown>
  }
}>

export type SubRouteHandlerResult<T extends FlowgladActionKey> =
  Awaited<ReturnType<SubRouteHandler<T>>>

export type SubRouteHandlerResultData<T extends FlowgladActionKey> =
  SubRouteHandlerResult<T>['data']

/**
 * Standard response shape for GetPricingModel endpoint.
 * Both authenticated and unauthenticated paths MUST return this exact shape.
 */
export interface GetPricingModelResponse {
  pricingModel: unknown // The actual PricingModel type from @flowglad/node
  source: 'customer' | 'default'
}

/**
 * Handler for routes that attempt authentication but gracefully fall back
 * to unauthenticated behavior if auth fails.
 *
 * The framework (requestHandler or better-auth) handles the auth logic:
 * - Attempts to authenticate the request
 * - If auth succeeds: flowgladServer is populated
 * - If auth fails: flowgladServer is null
 *
 * The handler then branches based on whether flowgladServer is available.
 *
 * IMPORTANT: The handler must NOT silently fall back if flowgladServer is
 * non-null but a subsequent API call fails. Only fall back when
 * flowgladServer is null (meaning auth was never established).
 */
export type HybridSubRouteHandler<T extends FlowgladActionKey> = (
  params: InferRouteHandlerParams<T>,
  context: {
    /** FlowgladServer instance if authentication succeeded, null otherwise */
    flowgladServer: FlowgladServer | null
    /** FlowgladServerAdmin instance (always available) */
    flowgladServerAdmin: FlowgladServerAdmin
  }
) => Promise<{
  data: Record<string, unknown>
  status: number
  error?: {
    code: string
    json: Record<string, unknown>
  }
}>
