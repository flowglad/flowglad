import { asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SelectOrgClient } from '@/app/select-org/select-org-client'
import { auth } from '@/lib/auth'
import { db } from '@/server/db/client'
import { betterAuthSchema } from '@/server/db/schema'

const { members, organizations } = betterAuthSchema

const SelectOrgPage = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    redirect('/sign-in')
  }

  const userOrganizations = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(members)
    .innerJoin(
      organizations,
      eq(members.organizationId, organizations.id)
    )
    .where(eq(members.userId, session.user.id))
    .orderBy(asc(organizations.name))

  return <SelectOrgClient organizations={userOrganizations} />
}

export default SelectOrgPage
