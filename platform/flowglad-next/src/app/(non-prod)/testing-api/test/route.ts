import { NextResponse } from 'next/server'
import { withNonProdRouteEnforcement } from '@/utils/withNonProdEnforcement'

export const GET = withNonProdRouteEnforcement(async () => {
  return NextResponse.json({ helloWorld: 'foobartest123' })
})
