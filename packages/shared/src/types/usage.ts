import type { Flowglad } from '@flowglad/node'

export type UsageMeter = Flowglad.UsageMeterClientSelectSchema

export type UsageEvent =
  Flowglad.UsageEventRetrieveResponse['usageEvent']
