import { idempotencyKeys } from '@trigger.dev/sdk'
import {
  type BinaryLike,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto'

// backend-only core utils that would break client-side code
export function hashData(data: BinaryLike) {
  return createHash('md5').update(data).digest('hex')
}

export async function createTriggerIdempotencyKey(key: string) {
  return await idempotencyKeys.create(key)
}

export function generateHmac({
  data,
  key,
  salt,
}: {
  data: string
  key: string
  salt?: string
}) {
  // Combine data and salt in a single string for consistency
  const combinedData = salt ? `${data}:${salt}` : data

  return createHmac('sha256', key)
    .update(combinedData)
    .digest('hex')
    .substring(0, 16) // Truncate to 16 chars for readability in IDs
}

export function generateRandomBytes(length?: number) {
  return randomBytes(length || 128).toString('hex')
}
