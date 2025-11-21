import { config } from 'dotenv'
import { Turbopuffer } from '@turbopuffer/turbopuffer'
import { OpenAI } from 'openai'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// Load environment variables from .env file in project root
config({ path: join(process.cwd(), '.env') })

const DOCS_DIR = join(process.cwd(), 'platform', 'docs')

interface DocFile {
  path: string
  content: string
  title?: string
  description?: string
}

// Extract frontmatter and content from MDX/MD files
const parseDocFile = (
  content: string
): { frontmatter: Record<string, string>; body: string } => {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (match) {
    const frontmatterStr = match[1]
    const body = match[2]
    const frontmatter: Record<string, string> = {}

    // Simple frontmatter parser
    frontmatterStr.split('\n').forEach((line) => {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line
          .slice(colonIndex + 1)
          .trim()
          .replace(/^["']|["']$/g, '')
        frontmatter[key] = value
      }
    })

    return { frontmatter, body }
  }

  return { frontmatter: {}, body: content }
}

// Recursively read all MDX and MD files
const readDocFiles = async (
  dir: string,
  basePath: string = ''
): Promise<DocFile[]> => {
  const files: DocFile[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = join(basePath, entry.name)

    if (entry.isDirectory()) {
      const subFiles = await readDocFiles(fullPath, relativePath)
      files.push(...subFiles)
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))
    ) {
      try {
        const content = await readFile(fullPath, 'utf-8')
        const { frontmatter, body } = parseDocFile(content)
        const textContent = body

        // Skip empty files
        if (textContent.trim().length === 0) {
          continue
        }

        files.push({
          path: relativePath,
          content: textContent,
          title: frontmatter.title,
          description: frontmatter.description,
        })
      } catch (error) {
        console.error(`Error reading ${fullPath}:`, error)
      }
    }
  }

  return files
}

// Create embedding using OpenAI
const createEmbedding = async (
  openai: OpenAI,
  text: string
): Promise<number[]> => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })

  return response.data[0].embedding
}

const main = async () => {
  // Validate environment variables
  if (!process.env.TURBOPUFFER_API_KEY) {
    throw new Error(
      'TURBOPUFFER_API_KEY environment variable is required'
    )
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  // Initialize clients
  const tpuf = new Turbopuffer({
    apiKey: process.env.TURBOPUFFER_API_KEY,
    region: process.env.TURBOPUFFER_REGION || 'gcp-us-central1',
  })

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  const namespace = tpuf.namespace('flowglad-docs')

  // Check if docs directory exists
  if (!existsSync(DOCS_DIR)) {
    throw new Error(`Docs directory not found: ${DOCS_DIR}`)
  }

  console.log(`Reading docs from ${DOCS_DIR}...`)
  const docFiles = await readDocFiles(DOCS_DIR)
  console.log(`Found ${docFiles.length} doc files`)

  // Process files in batches to avoid rate limits
  const batchSize = 10

  for (let i = 0; i < docFiles.length; i += batchSize) {
    const batch = docFiles.slice(i, i + batchSize)
    const batchNumber = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(docFiles.length / batchSize)
    console.log(
      `Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)...`
    )

    const upsertRows = await Promise.all(
      batch.map(async (doc) => {
        const embedding = await createEmbedding(openai, doc.content)

        return {
          id: doc.path,
          vector: embedding,
          path: doc.path,
          title: doc.title || doc.path,
          description: doc.description || '',
          text: doc.content,
        }
      })
    )

    // Upload batch to Turbopuffer
    await namespace.write({
      upsert_rows: upsertRows,
      distance_metric: 'cosine_distance',
      schema: {
        text: {
          type: 'string',
          full_text_search: true,
        },
        path: {
          type: 'string',
        },
        title: {
          type: 'string',
        },
        description: {
          type: 'string',
        },
      },
    })

    console.log(`Uploaded batch ${batchNumber}`)
  }

  console.log(
    `\n✅ Successfully embedded and uploaded ${docFiles.length} documents to Turbopuffer`
  )
  console.log(`Namespace: flowglad-docs`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
