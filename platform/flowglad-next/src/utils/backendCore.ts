import { createHash, createHmac } from 'crypto'
import { BinaryLike } from 'node:crypto'

// backend-only core utils that would break client-side code
export const hashData = (data: BinaryLike) =>
  createHash('md5').update(data).digest('hex')
