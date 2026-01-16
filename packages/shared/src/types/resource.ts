import type { Flowglad } from '@flowglad/node'

export type ResourceClaim =
  Flowglad.ResourceClaimClaimResponse['claims'][number]

export type ResourceUsage =
  Flowglad.ResourceClaimRetrieveUsageResponse['usage']

export type ResourceIdentifier =
  | {
      resourceSlug: string
    }
  | {
      resourceId: string
    }
