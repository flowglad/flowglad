import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const TEMP_CSS_PATH = path.join(__dirname, '../temp-styles.css')
const OUTPUT_TS_PATH = path.join(
  __dirname,
  '../src/generated/styles.ts'
)

// Ensure the generated directory exists
fs.mkdirSync(path.join(__dirname, '../src/generated'), {
  recursive: true,
})

// Build the CSS file using tailwindcss CLI
execSync(
  `tailwindcss -i ./src/globals.css -o ${TEMP_CSS_PATH} --minify`,
  { stdio: 'inherit' }
)

// Read the generated CSS
const cssContent = fs.readFileSync(TEMP_CSS_PATH, 'utf-8')

// Create the TypeScript content
const tsContent = `// This file is auto-generated. Do not edit it manually.
export const styles = \`${cssContent.replace(/`/g, '\\`')}\`
`

// Write the TypeScript file
fs.writeFileSync(OUTPUT_TS_PATH, tsContent)

// Clean up the temporary CSS file
fs.unlinkSync(TEMP_CSS_PATH)

console.log('✅ Successfully generated styles.ts')
