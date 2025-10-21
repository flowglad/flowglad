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

// No params; just return text
export default async function helloWorld() {
  return 'Hello world'
}
