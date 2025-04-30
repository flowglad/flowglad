import { idempotencyKeys } from '@trigger.dev/sdk/v3'
import { createHash, createHmac } from 'crypto'
import { BinaryLike } from 'node:crypto'

// backend-only core utils that would break client-side code
export const hashData = (data: BinaryLike) =>
  createHash('md5').update(data).digest('hex')

export const createTriggerIdempotencyKey = async (key: string) => {
  if (process.env.NODE_ENV === 'test') {
    return `test-${key}-${Math.random()}`
  }
  return await idempotencyKeys.create(key)
}
