// app/api/health/route.ts
import { log } from '@logtail/next';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Ensure Node.js runtime

export async function GET() {
  const timestamp = new Date().toISOString();

  log.info('Health check called', {
    service: 'flowglad-api',
    timestamp,
    status: 'healthy'
  });

  return NextResponse.json({
    status: 'healthy',
    timestamp
  });
}
