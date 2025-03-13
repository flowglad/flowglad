import { runAfterLast } from '../../scripts/runAfterLast'
// @ts-ignore
import { name, version } from './package.json'
import { defineConfig, type Options } from 'tsup'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import fs from 'fs/promises'
import path from 'path'

export default defineConfig((overrideOptions) => {
  const isProd = overrideOptions.env?.NODE_ENV === 'production'
  const shouldPublish = !!overrideOptions.env?.publish

  const common: Options = {
    entry: [
      './src/**/*.{ts,tsx,js,jsx}',
      '!./src/**/*.test.{ts,tsx}',
    ],
    bundle: false,
    clean: true,
    minify: false,
    external: ['#safe-node-apis'],
    sourcemap: true,
    legacyOutput: true,
    define: {
      PACKAGE_NAME: `"${name}"`,
      PACKAGE_VERSION: `"${version}"`,
      __DEV__: `${!isProd}`,
    },
    async onSuccess() {
      try {
        // Read the source CSS file
        const cssContent = await fs.readFile(
          path.join('./src', 'globals.css'),
          'utf-8'
        )

        // Process CSS with Tailwind
        const css = await postcss([
          tailwindcss({
            config: path.join(__dirname, 'tailwind.config.ts'),
          }),
          autoprefixer(),
        ]).process(cssContent, {
          from: path.join('./src', 'globals.css'),
        })

        // Write to both ESM and CJS directories
        const directories = ['./dist', './dist/cjs']

        for (const dir of directories) {
          // Ensure directory exists
          await fs.mkdir(dir, { recursive: true })
          // Write the processed CSS
          await fs.writeFile(path.join(dir, 'styles.css'), css.css)
        }

        console.log(
          '✅ CSS files processed and written to dist directories'
        )
      } catch (error) {
        console.error('Error processing CSS:', error)
        throw error // This will make the build fail if CSS processing fails
      }
    },
  }

  const esm: Options = {
    ...common,
    format: 'esm',
  }

  const cjs: Options = {
    ...common,
    format: 'cjs',
    outDir: './dist/cjs',
  }

  return runAfterLast([
    'pnpm build:declarations',
    shouldPublish && 'pnpm publish:local',
  ])(esm, cjs)
})
