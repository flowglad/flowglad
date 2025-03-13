import { z, ZodSchema } from 'zod'
import { FlowgladActionKey, HTTPMethod } from './types'

export type FlowgladActionValidatorMap = Record<
  FlowgladActionKey,
  {
    method: HTTPMethod
    inputValidator: ZodSchema
  }
>

export const createPurchaseSessionSchema = z.object({
  variantId: z.string(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

export type CreatePurchaseSessionParams = z.infer<
  typeof createPurchaseSessionSchema
>

export const flowgladActionValidators: FlowgladActionValidatorMap = {
  [FlowgladActionKey.GetCustomerProfileBilling]: {
    method: HTTPMethod.POST,
    inputValidator: z.object({
      externalId: z.string(),
    }),
  },
  [FlowgladActionKey.FindOrCreateCustomerProfile]: {
    method: HTTPMethod.POST,
    inputValidator: z.object({
      externalId: z.string(),
    }),
  },
  [FlowgladActionKey.CreatePurchaseSession]: {
    method: HTTPMethod.POST,
    inputValidator: createPurchaseSessionSchema,
  },
}
