import { Flowglad } from '@flowglad/node'
import { Dependency } from '@/test/behaviorTest'
import core from '@/utils/core'

interface SdkClientConfig {
  createClient: () => Flowglad
  baseUrl: string
  description: string
}

export abstract class SdkClientDep extends Dependency<SdkClientConfig>() {
  abstract createClient: () => Flowglad
  abstract baseUrl: string
  abstract description: string
}

// Production implementation (used by Trigger.dev cron)
SdkClientDep.implement('production', {
  createClient: () =>
    new Flowglad({
      apiKey: process.env.TELEMETRY_TEST_API_KEY,
      baseURL: core.NEXT_PUBLIC_APP_URL,
    }),
  baseUrl: core.NEXT_PUBLIC_APP_URL,
  description: 'Production API',
})
