#!/usr/bin/env tsx
import fs from 'fs/promises'
import path from 'path'

async function generatePromptTS() {
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
    const tsContent = `// This file is auto-generated from analyze-codebase.md
// To update, run: bun run scripts/generate-prompt-ts.ts

export default ${JSON.stringify(mdContent)}
`

    await fs.writeFile(tsPath, tsContent)
    console.log(
      '✅ Generated analyze-codebase.ts from analyze-codebase.md'
    )
  } catch (error) {
    console.error('❌ Error generating prompt TS file:', error)
    process.exit(1)
  }
}

generatePromptTS()
