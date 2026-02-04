import { panic } from '@/errors'

export const initBrowser = async () => {
  if (typeof window !== 'undefined') {
    panic('initBrowser must only be invoked in a server context')
  }
  /**
   * puppeteer needs to be dynamically imported so that Next.js doesn't try to bundle it
   * as part of the dependency graph for trigger.dev tasks.
   *
   * Since dynamic import is supported by Node as of version ≥18, we can use it here.
   */
  const [{ default: puppeteer }] = await Promise.all([
    import('puppeteer'),
    // Force Next.js output tracing to include ws when bundling with Bun.
    import('ws'),
  ])

  return await puppeteer.connect({
    browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
  })
}
