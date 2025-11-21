import { router } from '@/server/trpc'
import { publicProcedure } from '@/server/trpc'
import { z } from 'zod'
import {
  queryTurbopuffer,
  queryMultipleTurbopuffer,
  getTurbopufferClient,
  getOpenAIClient,
} from '@/utils/turbopuffer'

/**
 * fetchMarkdownFromDocs is imported dynamically to avoid loading fetch/undici
 * at module load time (e.g., when generating OpenAPI docs with tsx).
 */

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
    const tpuf = getTurbopufferClient()
    const openai = getOpenAIClient()

    const queryResults = await queryTurbopuffer(
      input.query,
      input.topK,
      'flowglad-docs',
      tpuf,
      openai
    )

    // Get original markdown files for each result from docs.flowglad.com
    const { fetchMarkdownFromDocs } = await import(
      '@/utils/textContent'
    )
    const resultsWithMarkdown = await Promise.all(
      queryResults.map(async (row) => {
        const markdown = await fetchMarkdownFromDocs(row.path)

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
    const tpuf = getTurbopufferClient()
    const openai = getOpenAIClient()

    // Get query results from turbopuffer
    const queryResults = await queryMultipleTurbopuffer(
      input.queries,
      input.topK,
      'flowglad-docs',
      tpuf,
      openai
    )

    // Flatten and deduplicate paths
    const pathSet = new Set<string>()
    const pathDetails: Array<{ path: string; queries: string[] }> = []

    queryResults.forEach((queryResult) => {
      queryResult.results.forEach((result) => {
        if (result.path && !pathSet.has(result.path)) {
          pathSet.add(result.path)
          pathDetails.push({
            path: result.path,
            queries: [queryResult.query],
          })
        } else if (result.path) {
          // Path already exists, add query to its queries list
          const existing = pathDetails.find(
            (p) => p.path === result.path
          )
          if (
            existing &&
            !existing.queries.includes(queryResult.query)
          ) {
            existing.queries.push(queryResult.query)
          }
        }
      })
    })

    // Sort paths alphabetically
    const deduplicatedPaths = pathDetails
      .map((p) => p.path)
      .sort((a, b) => a.localeCompare(b))

    // Fetch and concatenate all markdown files from docs.flowglad.com
    const { fetchMarkdownFromDocs } = await import(
      '@/utils/textContent'
    )
    const markdownContents: string[] = []
    for (const path of deduplicatedPaths) {
      const markdown = await fetchMarkdownFromDocs(path)

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

export const docsSearchRouter = router({
  queryDocs,
  queryMultipleDocs,
})
