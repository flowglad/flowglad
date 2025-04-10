import { pricesClientSelectSchema } from '@/db/schema/prices'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const rawPrice = {
    id: 'price_GCiIbo6Q8sVeEkAgTu1tW',
    createdAt: new Date('2025-04-10T02:20:33.956Z'),
    updatedAt: new Date('2025-04-10T02:20:46.640Z'),
    livemode: false,
    intervalUnit: 'month',
    name: '',
    intervalCount: 1,
    type: 'usage',
    trialPeriodDays: null,
    setupFeeAmount: null,
    isDefault: true,
    unitPrice: 100,
    productId: 'prod_MdCrRPGSOHNGSFpWga9Se',
    active: true,
    currency: 'GBP',
    externalId: null,
    usageMeterId: 'usage_meter_L42OJRajbThFOr1C1Jghu',
  }
  const { success, data, error } =
    pricesClientSelectSchema.safeParse(rawPrice)

  return NextResponse.json({
    message: 'pong',
    success,
    data,
    error,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  })
}
