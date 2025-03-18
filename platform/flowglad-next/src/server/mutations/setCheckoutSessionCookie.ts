import { publicProcedure } from '@/server/trpc'
import {
  getCheckoutSessionCookie,
  setCheckoutSessionCookie as setCheckoutSessionCookieFn,
  setCheckoutSessionCookieParamsSchema,
} from '@/utils/checkoutSessionState'

export const setCheckoutSessionCookie = publicProcedure
  .input(setCheckoutSessionCookieParamsSchema)
  .mutation(async ({ input }) => {
    const checkoutSessionId = await getCheckoutSessionCookie(input)
    /**
     * Override the purchase session only if the purchase session
     * - does not exist
     * - or the existing purchase session does not match the one
     *   provided by the client
     *
     * Otherwise, respect the existing purchase session cookie,
     * namely to allow it to expire naturally - as `setCheckoutSessionCookieFn`
     * will also set a new expiration date, pushing it further into the future.
     */
    if (checkoutSessionId === input.id) {
      return {
        data: { success: true },
      }
    }
    await setCheckoutSessionCookieFn(input)
    return {
      data: { success: true },
    }
  })
