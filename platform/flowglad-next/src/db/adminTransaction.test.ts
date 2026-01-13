import { describe, expect, it } from 'vitest'
import { comprehensiveAdminTransaction } from './adminTransaction'

describe('comprehensiveAdminTransaction', () => {
  it('propagates errors from transaction callback', async () => {
    await expect(
      comprehensiveAdminTransaction(async () => {
        throw new Error('Admin transaction rolled back')
      })
    ).rejects.toThrow('Admin transaction rolled back')
  })
})
