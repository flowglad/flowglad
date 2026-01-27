import { fixImportsPlugin } from 'esbuild-fix-imports-plugin'
import { defineConfig, type Options } from 'tsup'
import { runAfterLast } from '../../scripts/runAfterLast'
import { name, version } from './package.json'

export default defineConfig((overrideOptions) => {
  const isProd = overrideOptions.env?.NODE_ENV === 'production'
  const shouldPublish = !!overrideOptions.env?.publish

  const common: Options = {
    entry: [
      './src/**/*.{ts,tsx,js,jsx}',
      '!./src/**/*.test.{ts,tsx}',
    ],
    // We want to preserve original file structure
    // so that the "use client" directives are not lost
    // and make debugging easier via node_modules easier
    bundle: false,
    clean: true,
    minify: false,
    external: ['#safe-node-apis'],
    sourcemap: true,
    // Plugin to add .mjs/.cjs extensions to relative imports (required for ESM)
    esbuildPlugins: [fixImportsPlugin()],
    define: {
      PACKAGE_NAME: `"${name}"`,
      PACKAGE_VERSION: `"${version}"`,
      __DEV__: `${!isProd}`,
    },
  }

  const esm: Options = {
    ...common,
    format: 'esm',
    outDir: './dist/esm',
    // Use .mjs extension so Node.js recognizes files as ESM without package.json marker
    outExtension: () => ({ js: '.mjs' }),
  }

  const cjs: Options = {
    ...common,
    format: 'cjs',
    outDir: './dist/cjs',
    // Use .cjs extension so Node.js recognizes files as CJS without package.json marker
    outExtension: () => ({ js: '.cjs' }),
  }

  return runAfterLast([
    'bun run build:declarations',
    shouldPublish && 'bun run publish:local',
  ])(esm, cjs)
})
