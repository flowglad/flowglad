#!/usr/bin/env tsx
import fs from 'fs/promises'
import path from 'path'

async function syncPrompt() {
  const mdPath = path.join(
    process.cwd(),
    'src/prompts/analyze-codebase.md'
  )
  const tsPath = path.join(
    process.cwd(),
    'src/prompts/analyze-codebase.ts'
  )

  try {
    const mdContent = await fs.readFile(mdPath, 'utf-8')
    const tsContent = `// This file exports the content of analyze-codebase.md as a string
// Edit analyze-codebase.md and run: bun run scripts/sync-prompt.ts to update this file

export default ${JSON.stringify(mdContent)}
`

    await fs.writeFile(tsPath, tsContent)
    console.log(
      '✅ Synced analyze-codebase.ts from analyze-codebase.md'
    )
  } catch (error) {
    console.error('❌ Error syncing prompt file:', error)
    process.exit(1)
  }
}

syncPrompt()
