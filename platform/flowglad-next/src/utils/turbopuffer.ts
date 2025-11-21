import { Turbopuffer } from '@turbopuffer/turbopuffer'
import { OpenAI } from 'openai'

export const getTurbopufferClient = () => {
  if (!process.env.TURBOPUFFER_API_KEY) {
    throw new Error(
      'TURBOPUFFER_API_KEY environment variable is required'
    )
  }

  return new Turbopuffer({
    apiKey: process.env.TURBOPUFFER_API_KEY,
    region: process.env.TURBOPUFFER_REGION || 'aws-us-east-1',
  })
}

export const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export const createEmbedding = async (
  text: string,
  openai?: OpenAI
): Promise<number[]> => {
  const client = openai || getOpenAIClient()
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
  const client = tpuf || getTurbopufferClient()
  const namespace = client.namespace(namespaceName)

  const queryEmbedding = await createEmbedding(queryText, openai)

  const queryResult = await namespace.query({
    rank_by: ['vector', 'ANN', queryEmbedding],
    top_k: topK,
    distance_metric: 'cosine_distance',
    include_attributes: true,
  })

  return (queryResult.rows || []).map((row: any) => ({
    id: row.id,
    $dist: row.$dist,
    path: (row.path as string) || '',
    title: row.title,
    description: row.description,
    text: row.text,
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
  const client = tpuf || getTurbopufferClient()
  const oaiClient = openai || getOpenAIClient()

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
