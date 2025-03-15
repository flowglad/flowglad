import { protectedProcedure } from '@/server/trpc'
import {
  createOrganizationSchema,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'
import { customAlphabet } from 'nanoid'
import { currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { adminTransaction } from '@/db/databaseMethods'
import { stackServerApp } from '@/stack'

const generateSubdomainSlug = (name: string) => {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .slice(0, 50) // Enforce max length - 63 is the max for subdomains, but we'll be using 50 to make room for distinguishing suffix
      .replace(/^[^a-z0-9]+/, '') // Ensure starts with alphanumeric
      .replace(/[^a-z0-9]+$/, '') || // Ensure ends with alphanumeric
    'invalid-subdomain'
  ) // Fallback if result is empty
}

const mininanoid = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  6
)

/**
 * Creates an organization and inserts it into the database.
 * Creates a membership for the user requesting, and adds that to the database.
 * Also creates API keys for the organization.
 */
export const createOrganization = protectedProcedure
  .input(createOrganizationSchema)
  .output(
    z.object({
      organization: organizationsClientSelectSchema,
    })
  )
  .mutation(async ({ input }) => {
    const user = await stackServerApp.getUser()

    if (!user) {
      throw new Error('User not found')
    }
    const email = user.primaryEmail
    const userId = user.id
    if (!email) {
      throw new Error('User email not found')
    }

    const result = await adminTransaction(async ({ transaction }) => {
      return createOrganizationTransaction(
        input,
        {
          id: userId,
          email,
          fullName: user.displayName ?? undefined,
        },
        transaction
      )
    })

    return {
      organization: result.organization,
    }
  })
