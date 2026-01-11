import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { sql } from 'drizzle-orm'
import { adminTransaction } from '@/db/adminTransaction'
import { user } from '@/db/schema/betterAuthSchema'
import { router } from '@/server/trpc'
import { resetPassword } from './resetPassword'
import { auth } from '@/utils/auth'
import core from '@/utils/core'

// Mock auth.api.forgetPassword
vi.mock('@/utils/auth', () => ({
  auth: {
    api: {
      forgetPassword: vi.fn(),
    },
  },
}))

// Create a test router with the resetPassword procedure
const testRouter = router({
  resetPassword,
})

describe('resetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Clean up test users
    await adminTransaction(async ({ transaction }) => {
      await transaction.delete(user).where(sql`email LIKE 'test-reset-%'`)
    })
  })

  it('should send password reset email when user exists', async () => {
    const testEmail = `test-reset-${core.nanoid()}@test.com`
    const userId = `bau_${core.nanoid()}`

    // Create a test user
    await adminTransaction(async ({ transaction }) => {
      await transaction.insert(user).values({
        id: userId,
        email: testEmail,
        name: 'Test User',
        role: 'user',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    // Mock forgetPassword to succeed
    vi.mocked(auth.api.forgetPassword).mockResolvedValue({
      success: true,
    } as any)

    const ctx = {} as any
    const caller = testRouter.createCaller(ctx)
    const result = await caller.resetPassword({ email: testEmail })

    expect(auth.api.forgetPassword).toHaveBeenCalledWith({
      body: {
        email: testEmail,
        redirectTo: '/sign-in/reset-password',
      },
    })
    expect(result).toEqual({
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    })
  })

  it('should return success message even when user does not exist', async () => {
    const nonExistentEmail = `test-reset-nonexistent-${core.nanoid()}@test.com`

    const ctx = {} as any
    const caller = testRouter.createCaller(ctx)
    const result = await caller.resetPassword({ email: nonExistentEmail })

    expect(auth.api.forgetPassword).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    })
  })

  it('should return success message even when forgetPassword fails', async () => {
    const testEmail = `test-reset-${core.nanoid()}@test.com`
    const userId = `bau_${core.nanoid()}`

    // Create a test user
    await adminTransaction(async ({ transaction }) => {
      await transaction.insert(user).values({
        id: userId,
        email: testEmail,
        name: 'Test User',
        role: 'user',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    // Mock forgetPassword to fail
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    vi.mocked(auth.api.forgetPassword).mockRejectedValue(
      new Error('Failed to send email')
    )

    const ctx = {} as any
    const caller = testRouter.createCaller(ctx)
    const result = await caller.resetPassword({ email: testEmail })

    expect(auth.api.forgetPassword).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to send password reset email:',
      expect.any(Error)
    )
    expect(result).toEqual({
      success: true,
      message:
        'If an account exists with this email, a password reset link has been sent',
    })

    consoleErrorSpy.mockRestore()
  })

  it('should validate email format', async () => {
    const ctx = {} as any
    const caller = testRouter.createCaller(ctx)

    await expect(
      caller.resetPassword({ email: 'invalid-email' })
    ).rejects.toThrow()
  })
})
