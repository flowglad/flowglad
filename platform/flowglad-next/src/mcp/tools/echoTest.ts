import { z } from 'zod'
import { ServerTool } from '../toolWrap'

const messageSchema = {
  message: z.string(),
}

export const echoTest: ServerTool<typeof messageSchema> = {
  name: 'echoTest',
  description: 'Echo a test message',
  schema: messageSchema,
  callback: async ({ message }) => {
    return {
      content: [{ type: 'text', text: message }],
    }
  },
}
