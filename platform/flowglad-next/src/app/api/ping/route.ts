import { adminTransaction } from '@/db/adminTransaction'
import { helloWorldTask } from '@/trigger/example'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'
import { core } from '@/utils/core'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  await helloWorldTask.trigger({})
  return NextResponse.json({
    message: 'pong',
    customerBilling: await adminTransaction(
      async ({ transaction }) => {
        return customerBillingTransaction(
          {
            externalId: 'ol6EXW79GegmPjVh2DplR',
            organizationId: 'org_UcqNy9z79gTbcPNGd4TBz',
          },
          transaction
        )
      }
    ),
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
