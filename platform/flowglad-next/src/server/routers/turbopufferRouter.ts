import { router } from '@/server/trpc'
import { publicProcedure } from '@/server/trpc'
import { Turbopuffer } from '@turbopuffer/turbopuffer'
import { OpenAI } from 'openai'
import { z } from 'zod'

const queryDocsSchema = z.object({
  query: z.string().min(1),
  topK: z.number().min(1).max(20).default(5),
})

const queryMultipleDocsSchema = z.object({
  queries: z.array(z.string().min(1)).min(1),
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

    // Get original markdown files for each result from docs.flowglad.com
    const resultsWithMarkdown = await Promise.all(
      (queryResult.rows || []).map(async (row: any) => {
        const path = (row.path as string) || ''
        // Convert .mdx to .md for the URL
        const urlPath = path.endsWith('.mdx')
          ? path.slice(0, -1) // Remove 'x' from .mdx to make it .md
          : path

        const url = `https://docs.flowglad.com/${urlPath}`

        let markdown: string | null = null
        try {
          const response = await fetch(url)
          if (response.ok) {
            markdown = await response.text()
          } else {
            console.warn(
              `Could not fetch markdown file from ${url}: ${response.status} ${response.statusText}`
            )
          }
        } catch (error) {
          // File might not exist or there was a network error
          console.warn(
            `Could not fetch markdown file from ${url}:`,
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

const queryMultipleDocs = publicProcedure
  .input(queryMultipleDocsSchema)
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

    // Process all queries in parallel
    const queryResults = await Promise.all(
      input.queries.map(async (queryText) => {
        // Create embedding for the query
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: queryText,
        })

        const queryEmbedding = embeddingResponse.data[0].embedding

        // Query turbopuffer using v2 API with rank_by
        const queryResult = await namespace.query({
          rank_by: ['vector', 'ANN', queryEmbedding],
          top_k: input.topK,
          distance_metric: 'cosine_distance',
          include_attributes: true,
        })

        // Extract paths from results
        return (queryResult.rows || []).map((row: any) => ({
          path: (row.path as string) || '',
          query: queryText,
        }))
      })
    )

    // Flatten and deduplicate paths
    const pathSet = new Set<string>()
    const pathDetails: Array<{ path: string; queries: string[] }> = []

    queryResults.forEach((results, queryIndex) => {
      results.forEach((result) => {
        if (result.path && !pathSet.has(result.path)) {
          pathSet.add(result.path)
          pathDetails.push({
            path: result.path,
            queries: [result.query],
          })
        } else if (result.path) {
          // Path already exists, add query to its queries list
          const existing = pathDetails.find(
            (p) => p.path === result.path
          )
          if (existing && !existing.queries.includes(result.query)) {
            existing.queries.push(result.query)
          }
        }
      })
    })

    // Sort paths alphabetically
    const deduplicatedPaths = pathDetails
      .map((p) => p.path)
      .sort((a, b) => a.localeCompare(b))

    // Fetch and concatenate all markdown files from docs.flowglad.com
    const markdownContents: string[] = []
    for (const path of deduplicatedPaths) {
      // Convert .mdx to .md for the URL
      const urlPath = path.endsWith('.mdx')
        ? path.slice(0, -1) // Remove 'x' from .mdx to make it .md
        : path

      const url = `https://docs.flowglad.com/${urlPath}`

      let markdown: string | null = null
      try {
        const response = await fetch(url)
        if (response.ok) {
          markdown = await response.text()
        } else {
          console.warn(
            `Could not fetch markdown file from ${url}: ${response.status} ${response.statusText}`
          )
        }
      } catch (error) {
        // File might not exist or there was a network error
        console.warn(
          `Could not fetch markdown file from ${url}:`,
          error
        )
      }

      if (markdown) {
        // Add separator with file path
        markdownContents.push(
          `\n\n${'='.repeat(80)}\nFILE: ${path}\n${'='.repeat(80)}\n\n${markdown}`
        )
      }
    }

    const concatenatedMarkdown = markdownContents.join('') || ''

    return {
      queries: input.queries,
      paths: deduplicatedPaths,
      totalQueries: input.queries.length,
      totalPaths: deduplicatedPaths.length,
      concatenatedMarkdown: concatenatedMarkdown || '',
    }
  })

export const turbopufferRouter = router({
  queryDocs,
  queryMultipleDocs,
})
