import { z } from 'zod'
import { StripeConnectContractType } from '@/types'
import { referralOptionEnum } from '@/utils/referrals'

export const organizationNameStepSchema = z.object({
  organization: z.object({
    name: z.string().min(1, 'Organization name is required'),
  }),
})

export const countryStepSchema = z.object({
  organization: z.object({
    countryId: z.string().min(1, 'Please select a country'),
  }),
})

export const paymentProcessingStepSchema = z.object({
  organization: z.object({
    stripeConnectContractType: z.enum(StripeConnectContractType),
  }),
})

export const codebaseAnalysisStepSchema = z.object({
  codebaseMarkdown: z.string().optional(),
})

export const referralStepSchema = z.object({
  referralSource: referralOptionEnum.optional(),
})

// Combined schema for the full form
export const businessDetailsFormSchema = z.object({
  organization: z.object({
    name: z.string().min(1, 'Organization name is required'),
    countryId: z.string().min(1, 'Please select a country'),
    stripeConnectContractType: z
      .enum(StripeConnectContractType)
      .optional(),
  }),
  codebaseMarkdown: z.string().optional(),
  referralSource: referralOptionEnum.optional(),
})

export type BusinessDetailsFormData = z.infer<
  typeof businessDetailsFormSchema
>
