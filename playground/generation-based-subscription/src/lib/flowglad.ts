import { FlowgladServer } from '@flowglad/nextjs/server'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/server/db/client'
import { betterAuthSchema } from '@/server/db/schema'

const { users } = betterAuthSchema

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    // rm for production
    baseURL: 'http://localhost:3000',
    customerExternalId,
    getCustomerDetails: async (externalId: string) => {
      // Try to get organization first (since customerType is 'organization')
      try {
        const orgData = await auth.api.getFullOrganization({
          query: {
            organizationId: externalId,
          },
          headers: await headers(),
        })

        if (orgData?.name) {
          // This is an organization - get user email from session for organization email
          const session = await auth.api.getSession({
            headers: await headers(),
          })
          if (!session?.user) {
            throw new Error('User not authenticated')
          }
          return {
            email: session.user.email || '',
            name: orgData.name,
          }
        }
      } catch (error) {
        // If organization lookup fails, fall through to user lookup
      }

      // Fallback to user (for backwards compatibility)
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, externalId))
        .limit(1)

      if (user) {
        return {
          email: user.email || '',
          name: user.name || '',
        }
      }

      throw new Error(`Customer not found: ${externalId}`)
    },
  })
}
