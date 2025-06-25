import { z } from 'zod'
import { ServerTool, ToolConstructor } from '../toolWrap'

const messageSchema = {
  message: z.string(),
}

export const echoTest: ToolConstructor<typeof messageSchema> = {
  name: 'echoTest',
  description: 'Echo a test message',
  schema: messageSchema,
  callbackConstructor:
    (apiKey: string) =>
    async ({ message }) => {
      return {
        content: [{ type: 'text', text: message }],
      }
    },
}
