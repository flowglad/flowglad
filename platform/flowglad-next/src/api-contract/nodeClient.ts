import core from '@/utils/core'
import { Flowglad } from '@flowglad/node'

export const flowgladNode = () => {
  return new Flowglad({
    apiKey: process.env.TELEMETRY_TEST_API_KEY,
    baseURL: core.NEXT_PUBLIC_APP_URL,
  })
}
