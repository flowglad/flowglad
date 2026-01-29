// utils/invoice/pdfGenerator.ts

import type { Invoice } from '@db-core/schema/invoices'
import { logger } from '@trigger.dev/sdk'
import { initBrowser } from '@/utils/browser'
import cloudflareMethods from '@/utils/cloudflare'
import core from '@/utils/core'

export interface InvoicePdfContext {
  invoice: Invoice.Record
}

export const generatePdf = async ({
  url,
  bucketKey,
}: {
  url: string
  bucketKey: string
}) => {
  const browser = await initBrowser()
  try {
    const page = await browser.newPage()
    const response = await page.goto(url)

    if (!response || !response.ok()) {
      const status = response?.status() ?? 'unknown'
      const statusText = response?.statusText() ?? 'unknown'
      throw new Error(
        `Failed to load page for PDF generation: ${status} ${statusText}. URL: ${url}`
      )
    }

    logger.info('PDF generated from URL', { url })
    // Generate PDF with embedded fonts
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    })

    await cloudflareMethods.putPDF({
      body: pdfBuffer as Buffer,
      key: bucketKey,
    })

    logger.log('PDF uploaded to R2', {
      url: core.safeUrl(
        bucketKey,
        cloudflareMethods.BUCKET_PUBLIC_URL
      ),
    })
  } finally {
    await browser.close()
  }
}
