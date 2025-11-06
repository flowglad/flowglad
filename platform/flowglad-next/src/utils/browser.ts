export const initBrowser = async () => {
  if (typeof window !== 'undefined') {
    throw new Error('initBrowser must only be invoked in a server context')
  }

  const [{ default: puppeteer }] = await Promise.all([
    import('puppeteer'),
    // Force Next.js output tracing to include ws when bundling with Bun.
    import('ws'),
  ])

  return await puppeteer.connect({
    browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
  })
}
