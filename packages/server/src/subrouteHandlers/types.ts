import { FlowgladActionKey } from '@flowglad/shared'
import type { flowgladActionValidators } from '@flowglad/shared'
import type { FlowgladServer } from '../flowgladServer'
import z from 'zod'

export type InferRouteHandlerParams<T extends FlowgladActionKey> = {
  method: (typeof flowgladActionValidators)[T]['method']
  data: z.infer<
    (typeof flowgladActionValidators)[T]['inputValidator']
  >
}

export type SubRouteHandler<T extends FlowgladActionKey> = (
  params: InferRouteHandlerParams<T>,
  flowgladServer: FlowgladServer
) => Promise<{
  data: {}
  status: number
  error?: string
}>
