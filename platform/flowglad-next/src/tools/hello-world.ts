import { type ToolMetadata } from 'xmcp'

export const metadata: ToolMetadata = {
  name: 'hello-world',
  description: 'Return a hello world message',
  annotations: {
    title: 'Hello World',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
}

export default async function helloWorld() {
  return {
    content: [{ type: 'text', text: 'Hi, world!' }],
  }
}
