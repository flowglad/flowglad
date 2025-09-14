import { Flowglad } from '@flowglad/node'

export const flowgladNode = () => {
  return new Flowglad({
    apiKey: process.env.TELEMETRY_TEST_API_KEY,
    baseURL: process.env.NEXT_PUBLIC_APP_URL,
  })
}
