import { withLogtail } from '@logtail/next'
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: Required by `Dockerfile` so that it can copy the `standalone` output
  // directory in order to run the server.
  output: 'standalone',
  outputFileTracingIncludes: {
    // Include registry files
    registry: ['./src/registry/**/*'],
    // Explicitly include undici and related packages in standalone output for all routes
    // These are needed by @turbopuffer/turbopuffer and openai
    '/**': [
      './node_modules/undici/**/*',
      './node_modules/@turbopuffer/turbopuffer/**/*',
      './node_modules/openai/**/*',
    ],
  },
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-core',
    '@sparticuz/chromium',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'chromium-bidi',
    'ws',
    // Turbopuffer and OpenAI depend on undici, which needs to be externalized
    // to avoid bundling issues in production (Vercel)
    'undici',
    '@turbopuffer/turbopuffer',
    'openai',
  ],
  images: {
    remotePatterns: process.env.NEXT_PUBLIC_CDN_URL
      ? [
          {
            protocol: 'https',
            hostname: process.env.NEXT_PUBLIC_CDN_URL,
            port: '',
          },
        ]
      : [],
    // Enable unoptimized images for local development
    unoptimized: process.env.NODE_ENV === 'development',
  },
  rewrites: async () => {
    return [
      {
        source: '/blog/:path*',
        destination: 'https://flowglad.com/blog/:path*',
      },
    ]
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', // Or specify your domain
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-vercel-protection-bypass',
          },
        ],
      },
    ]
  },
  experimental: {
    webpackMemoryOptimizations: true,
    turbo: {
      rules: {
        '*.md': {
          loaders: ['raw-loader'],
          as: '*.js',
        },
      },
    },
  },
  webpack: (
    config,
    { buildId, dev, isServer, defaultLoaders, webpack }
  ) => {
    config.module.rules.push({
      test: /\.md$/,
      // This is the asset module.
      type: 'asset/source',
    })

    // Add resolve aliases for chromium-bidi
    config.resolve.alias = {
      ...config.resolve.alias,
      'chromium-bidi/lib/cjs/bidiMapper/BidiMapper.js':
        'chromium-bidi/lib/esm/bidiMapper/BidiMapper.js',
      'chromium-bidi/lib/cjs/protocol/protocol.js':
        'chromium-bidi/lib/esm/protocol/protocol.js',
    }

    // Use Zod subpath versioning for trigger.dev compatibility
    // trigger.dev expects Zod 3, but we're using Zod 4
    // Redirect trigger.dev's zod imports to zod/v3
    if (isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^zod$/,
          (resource) => {
            // Check if this import is from trigger.dev
            const context = resource.context || ''
            if (
              context.includes('@trigger.dev') ||
              context.includes('trigger.dev')
            ) {
              // Use zod/v3 for trigger.dev compatibility
              resource.request = 'zod/v3'
            }
          }
        )
      )
    }

    return config
  },
}

export default withSentryConfig(withLogtail(nextConfig), {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'flowglad',
  project: 'javascript-nextjs',
  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
})
