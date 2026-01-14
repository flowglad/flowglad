import type { Flowglad } from '@flowglad/node'

export type ResourceClaim =
  Flowglad.ResourceClaimClaimResponse['claims'][number]

export type ResourceUsage =
  Flowglad.ResourceClaimUsageResponse['usage'][number]
