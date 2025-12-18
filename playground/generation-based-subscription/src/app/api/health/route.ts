import { NextResponse } from 'next/server'

export function GET(): NextResponse {
  console.log('auth.api.helloWorld')
  return NextResponse.json({ status: 'ok' })
}
