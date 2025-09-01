#!/usr/bin/env tsx
/* eslint-disable no-console */
import fs from 'fs/promises'
import path from 'path'
import postcss from 'postcss'
import crypto from 'crypto'

async function buildPreviewCSS() {
  console.log('🎨 Building preview CSS...')

  const inputPath = path.join(
    process.cwd(),
    'src/app/(preview)/preview-ui/styles/preview.css'
  )

  const outputDir = path.join(process.cwd(), 'public/preview')
  const outputPath = path.join(outputDir, 'preview.css')

  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true })

    // Read input CSS
    const inputCSS = await fs.readFile(inputPath, 'utf-8')

    // Load PostCSS config
    const postcssConfig = {
      plugins: [
        require('tailwindcss')({
          config: './tailwind.preview.config.ts',
        }),
        require('autoprefixer'),
      ],
    }

    // Process CSS with PostCSS
    const result = await postcss(postcssConfig.plugins).process(
      inputCSS,
      {
        from: inputPath,
        to: outputPath,
      }
    )

    // Write compiled CSS
    await fs.writeFile(outputPath, result.css)

    // Generate hash for cache-busting
    const hash = crypto
      .createHash('md5')
      .update(result.css)
      .digest('hex')
      .substring(0, 8)

    // Create manifest with metadata
    const manifest = {
      hash,
      path: `/preview/preview.css`,
      size: Buffer.byteLength(result.css),
      generatedAt: new Date().toISOString(),
    }

    await fs.writeFile(
      path.join(outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )

    // Also create a hashed version for production
    const hashedPath = path.join(outputDir, `preview.${hash}.css`)
    await fs.writeFile(hashedPath, result.css)

    console.log('✅ Preview CSS built successfully!')
    console.log(`   Output: ${outputPath}`)
    console.log(`   Hashed: ${hashedPath}`)
    console.log(`   Size: ${(manifest.size / 1024).toFixed(2)}kb`)
    console.log(`   Hash: ${hash}`)
  } catch (error) {
    console.error('❌ Error building preview CSS:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  buildPreviewCSS()
}

export { buildPreviewCSS }
