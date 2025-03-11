import { publicProcedure } from '@/server/trpc'
import {
  getPurchaseSessionCookie,
  setPurchaseSessionCookie as setPurchaseSessionCookieFn,
  setPurchaseSessionCookieParamsSchema,
} from '@/utils/purchaseSessionState'

export const setPurchaseSessionCookie = publicProcedure
  .input(setPurchaseSessionCookieParamsSchema)
  .mutation(async ({ input }) => {
    const purchaseSessionId = getPurchaseSessionCookie(input)
    /**
     * Override the purchase session only if the purchase session
     * - does not exist
     * - or the existing purchase session does not match the one
     *   provided by the client
     *
     * Otherwise, respect the existing purchase session cookie,
     * namely to allow it to expire naturally - as `setPurchaseSessionCookieFn`
     * will also set a new expiration date, pushing it further into the future.
     */
    if (purchaseSessionId === input.id) {
      return {
        data: { success: true },
      }
    }
    await setPurchaseSessionCookieFn(input)
    return {
      data: { success: true },
    }
  })
