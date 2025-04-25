import { z } from 'zod'

export const requestMagicLinkSchema = z.object({
  organizationId: z.string(),
  customerEmail: z.string(),
  customerExternalId: z.string(),
})

export type RequestMagicLinkBody = z.infer<
  typeof requestMagicLinkSchema
>
