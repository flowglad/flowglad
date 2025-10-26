import { runAfterLast } from '../../scripts/runAfterLast'
// @ts-ignore
import { name, version } from './package.json'
import { defineConfig, type Options } from 'tsup'

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
    'bun run build:declarations',
    shouldPublish && 'bun run publish:local',
  ])(esm, cjs)
})
