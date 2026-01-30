import { defineConfig, type Options } from 'tsup'
import { runAfterLast } from '../../scripts/runAfterLast'
import { name, version } from './package.json'

export default defineConfig((overrideOptions) => {
  const isProd = overrideOptions.env?.NODE_ENV === 'production'
  const shouldPublish = !!overrideOptions.env?.publish

  // CLI entry point - bundled single file with shebang
  // Use named entry to output as cli.js to match bin entry in package.json
  const cli: Options = {
    entry: { cli: './src/cli/index.ts' },
    outDir: './dist',
    format: 'cjs',
    outExtension: () => ({ js: '.js' }),
    bundle: true,
    clean: true,
    minify: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    define: {
      PACKAGE_NAME: `"${name}"`,
      PACKAGE_VERSION: `"${version}"`,
      __DEV__: `${!isProd}`,
    },
  }

  // Library exports - unbundled for tree-shaking (future monopackage)
  const common: Options = {
    entry: ['./src/index.ts'],
    bundle: false,
    clean: false, // Don't clean - cli build already did
    minify: false,
    sourcemap: true,
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
    outExtension: () => ({ js: '.mjs' }),
  }

  const cjs: Options = {
    ...common,
    format: 'cjs',
    outDir: './dist/cjs',
    outExtension: () => ({ js: '.cjs' }),
  }

  return runAfterLast([
    'bun run build:declarations',
    shouldPublish && 'bun run publish:local',
  ])(cli, esm, cjs)
})
