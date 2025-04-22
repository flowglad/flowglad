import puppeteer from 'puppeteer'

export const initBrowser = async () => {
  return await puppeteer.connect({
    browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
  })
}
