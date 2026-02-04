/**
 * Turbopuffer and OpenAI packages are imported dynamically to avoid loading undici at module load time.
 * When this module is statically imported (e.g., by docsSearchRouter -> appRouter -> swagger),
 * static imports of '@turbopuffer/turbopuffer' and 'openai' cause undici to load, which expects the File API
 * to be available. This causes "ReferenceError: File is not defined" when generating OpenAPI
 * docs with tsx in Node.js environments where File is not available.
 */

// Type-only imports for TypeScript (these don't cause runtime code to execute)
import type { Turbopuffer } from '@turbopuffer/turbopuffer'
import type { Row } from '@turbopuffer/turbopuffer/resources/namespaces'
import type { OpenAI } from 'openai'
import { panic } from '@/errors'

export const getTurbopufferClient =
  async (): Promise<Turbopuffer> => {
    if (!process.env.TURBOPUFFER_API_KEY) {
      panic('TURBOPUFFER_API_KEY environment variable is required')
    }

    // Dynamically import to avoid loading undici at module load time
    const { Turbopuffer: TurbopufferClass } = await import(
      '@turbopuffer/turbopuffer'
    )

    return new TurbopufferClass({
      apiKey: process.env.TURBOPUFFER_API_KEY,
      region: process.env.TURBOPUFFER_REGION || 'aws-us-east-1',
    })
  }

export const getOpenAIClient = async (): Promise<OpenAI> => {
  if (!process.env.OPENAI_API_KEY) {
    panic('OPENAI_API_KEY environment variable is required')
  }

  // Dynamically import to avoid loading undici at module load time
  const { OpenAI } = await import('openai')

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export const createEmbedding = async (
  text: string,
  openai?: OpenAI
): Promise<number[]> => {
  const client = openai || (await getOpenAIClient())
  const embeddingResponse = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })

  return embeddingResponse.data[0].embedding
}

export interface QueryDocsResult {
  id: string | number
  $dist: number
  path: string
  title?: string
  description?: string
  text?: string
}

export const queryTurbopuffer = async (
  queryText: string,
  topK: number,
  namespaceName: string = 'flowglad-docs',
  tpuf?: Turbopuffer,
  openai?: OpenAI
): Promise<QueryDocsResult[]> => {
  const client = tpuf || (await getTurbopufferClient())
  const namespace = client.namespace(namespaceName)

  const queryEmbedding = await createEmbedding(queryText, openai)

  const queryResult = await namespace.query({
    rank_by: ['vector', 'ANN', queryEmbedding],
    top_k: topK,
    distance_metric: 'cosine_distance',
    include_attributes: true,
  })

  return (queryResult.rows || []).map((row: Row) => ({
    id: row.id,
    $dist: row.$dist!,
    path: (row.path as string) || '',
    title: row.title as string,
    description: row.description as string,
    text: row.text as string,
  }))
}

export interface MultipleQueryResult {
  query: string
  results: QueryDocsResult[]
}

export const queryMultipleTurbopuffer = async (
  queries: string[],
  topK: number,
  namespaceName: string = 'flowglad-docs',
  tpuf?: Turbopuffer,
  openai?: OpenAI
): Promise<MultipleQueryResult[]> => {
  const client = tpuf || (await getTurbopufferClient())
  const oaiClient = openai || (await getOpenAIClient())

  // Process all queries in parallel
  const queryResults = await Promise.all(
    queries.map(async (queryText) => {
      const results = await queryTurbopuffer(
        queryText,
        topK,
        namespaceName,
        client,
        oaiClient
      )

      return {
        query: queryText,
        results,
      }
    })
  )

  return queryResults
}
