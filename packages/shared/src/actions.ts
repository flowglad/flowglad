import { z, ZodSchema } from 'zod'
import { FlowgladActionKey, HTTPMethod } from './types'

export type FlowgladActionValidatorMap = Record<
  FlowgladActionKey,
  {
    method: HTTPMethod
    inputValidator: ZodSchema
  }
>

export const createCheckoutSessionSchema = z.object({
  priceId: z.string(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

export type CreateCheckoutSessionParams = z.infer<
  typeof createCheckoutSessionSchema
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
  [FlowgladActionKey.CreateCheckoutSession]: {
    method: HTTPMethod.POST,
    inputValidator: createCheckoutSessionSchema,
  },
}
