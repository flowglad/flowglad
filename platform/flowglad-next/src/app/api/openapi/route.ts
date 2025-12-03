import yaml from 'json-to-pretty-yaml'
import { z } from 'zod'
import { createFlowgladOpenApiDocument } from '@/server/swagger'

const formatSchema = z.enum(['json', 'yaml', 'yml']).optional()

export const GET = async (request: Request) => {
  const url = new URL(request.url)
  const format = formatSchema.parse(
    url.searchParams.get('format')?.toLowerCase()
  )

  const document = createFlowgladOpenApiDocument()

  if (format === 'yaml' || format === 'yml') {
    return new Response(yaml.stringify(document))
  }

  return new Response(JSON.stringify(document))
}
