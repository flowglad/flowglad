import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export function GET(): NextResponse {
  console.log('auth.api.helloWorld', auth.api.helloWorld)
  return NextResponse.json({ status: 'ok' })
}
