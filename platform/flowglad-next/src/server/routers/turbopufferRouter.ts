import { router } from '@/server/trpc'
import { publicProcedure } from '@/server/trpc'
import { Turbopuffer } from '@turbopuffer/turbopuffer'
import { OpenAI } from 'openai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { join } from 'path'

const queryDocsSchema = z.object({
  query: z.string().min(1),
  topK: z.number().min(1).max(20).default(5),
})

const queryDocs = publicProcedure
  .input(queryDocsSchema)
  .query(async ({ input }) => {
    if (!process.env.TURBOPUFFER_API_KEY) {
      throw new Error(
        'TURBOPUFFER_API_KEY environment variable is required'
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY environment variable is required'
      )
    }

    const tpuf = new Turbopuffer({
      apiKey: process.env.TURBOPUFFER_API_KEY,
      region: process.env.TURBOPUFFER_REGION || 'aws-us-east-1',
    })

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const namespace = tpuf.namespace('flowglad-docs')

    // Create embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: input.query,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Query turbopuffer using v2 API with rank_by
    const queryResult = await namespace.query({
      rank_by: ['vector', 'ANN', queryEmbedding],
      top_k: input.topK,
      distance_metric: 'cosine_distance',
      include_attributes: true,
    })

    // Get original markdown files for each result
    const resultsWithMarkdown = await Promise.all(
      (queryResult.rows || []).map(async (row: any) => {
        const path = (row.path as string) || ''
        // Path is stored relative to platform/docs directory
        // Try both .mdx and .md extensions
        const basePath = join(process.cwd(), 'platform', 'docs', path)
        const mdxPath = basePath.endsWith('.mdx')
          ? basePath
          : `${basePath}.mdx`
        const mdPath = basePath.endsWith('.md')
          ? basePath
          : `${basePath}.md`

        let markdown: string | null = null
        try {
          // Try .mdx first, then .md
          try {
            markdown = await readFile(mdxPath, 'utf-8')
          } catch {
            markdown = await readFile(mdPath, 'utf-8')
          }
        } catch (error) {
          // File might not exist or path might be different
          console.warn(
            `Could not read markdown file at ${mdxPath} or ${mdPath}:`,
            error
          )
        }

        return {
          id: row.id,
          distance: row.$dist,
          path: row.path,
          title: row.title,
          description: row.description,
          text: row.text,
          markdown,
        }
      })
    )

    return {
      query: input.query,
      results: resultsWithMarkdown,
    }
  })

export const turbopufferRouter = router({
  queryDocs,
})
