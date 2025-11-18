/* eslint-disable no-console */

import fs from 'fs/promises'
import path from 'path'

async function syncPrompts() {
  const promptsDir = path.join(process.cwd(), 'src/prompts')

  try {
    const files = await fs.readdir(promptsDir)
    const mdFiles = files.filter((file) => file.endsWith('.md'))

    if (mdFiles.length === 0) {
      console.log('ℹ️  No .md files found in src/prompts')
      return
    }

    for (const mdFile of mdFiles) {
      const baseName = mdFile.replace('.md', '')
      const mdPath = path.join(promptsDir, mdFile)
      const tsPath = path.join(promptsDir, `${baseName}.ts`)

      const mdContent = await fs.readFile(mdPath, 'utf-8')
      const tsContent = `// This file exports the content of ${mdFile} as a string
// Edit ${mdFile} and run: bun run scripts/promptsToTs.ts to update this file

const prompt = ${JSON.stringify(mdContent)}

export default prompt
`

      await fs.writeFile(tsPath, tsContent)
      console.log(`✅ Synced ${baseName}.ts from ${mdFile}`)
    }

    console.log(
      `\n✨ Successfully synced ${mdFiles.length} prompt file(s)`
    )
  } catch (error) {
    console.error('❌ Error syncing prompt files:', error)
    process.exit(1)
  }
}

syncPrompts()
