import core from '@/utils/core'
import { NextResponse } from 'next/server'
import { sendPaymentFailedEmail, sendOrganizationPaymentFailedNotificationEmail } from '@/utils/email'
import { CurrencyCode } from '@/types'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  if (!core.IS_PROD) {
    // Send mock customer payment failed email
    await sendPaymentFailedEmail({
      to: ['agree.ahmed+customer@flowglad.com'],
      organizationName: 'Acme Inc',
      organizationLogoUrl: 'https://cdn-flowglad.com/example-logo.png',
      invoiceNumber: 'INV-12345',
      orderDate: new Date(),
      lineItems: [
        { name: 'Pro Plan', price: 2500, quantity: 1 },
        { name: 'Add-on Support', price: 2500, quantity: 1 },
      ],
      currency: CurrencyCode.USD,
    })

    // Send mock organization teammate payment failed email
    await sendOrganizationPaymentFailedNotificationEmail({
      to: ['agree.ahmed+org@flowglad.com'],
      organizationName: 'Acme Inc',
      amount: 5000,
      currency: CurrencyCode.USD,
      customerId: 'cus_test123',
      customerName: 'John Doe',
      invoiceNumber: 'INV-12345',
    })
  }

  return NextResponse.json({
    message: 'pong',
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
