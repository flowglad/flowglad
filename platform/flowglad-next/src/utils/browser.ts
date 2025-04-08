import chrome from '@sparticuz/chromium-min'
import puppeteerCore from 'puppeteer-core'
import puppeteer from 'puppeteer'

import core from './core'

const LOCAL_CHROME_EXECUTABLE =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const initBrowser = async () => {
  if (core.IS_DEV) {
    const innerBrowser = await puppeteerCore.launch({
      executablePath: LOCAL_CHROME_EXECUTABLE,
      args: [
        ...chrome.args,
        // '--font-render-hinting=none'
      ],
      defaultViewport: chrome.defaultViewport,
      headless: 'new',
      ignoreHTTPSErrors: true,
    })
    return innerBrowser
  }
  return await puppeteer.connect({
    browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
  })
}
