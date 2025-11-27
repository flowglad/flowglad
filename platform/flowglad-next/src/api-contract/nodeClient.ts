import { Flowglad } from '@flowglad/node'
import core from '@/utils/core'

export const flowgladNode = () => {
  return new Flowglad({
    apiKey: process.env.TELEMETRY_TEST_API_KEY,
    baseURL: core.NEXT_PUBLIC_APP_URL,
  })
}
