import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'

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
        content: [
          {
            type: 'text',
            text: 'Add a new Next.js App Router 14 route at /app/ping/route.ts',
          },
        ],
      }
    },
}
