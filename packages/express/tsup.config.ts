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
    // We want to preserve original file structure
    // so that the "use client" directives are not lost
    // and make debugging easier via node_modules easier
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

  const serverActionsEsm: Options = {
    ...esm,
    sourcemap: false,
  }

  const serverActionsCjs: Options = {
    ...cjs,
    sourcemap: false,
  }

  return runAfterLast([
    'pnpm build:declarations',
    // copyPackageJson('esm'),
    // copyPackageJson('cjs'),
    shouldPublish && 'pnpm publish:local',
  ])(esm, cjs, serverActionsEsm, serverActionsCjs)
})
