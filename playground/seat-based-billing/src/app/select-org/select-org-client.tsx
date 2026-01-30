'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

type OrganizationListItem = {
  id: string
  name: string
  slug: string
}

type SelectOrgClientProps = {
  organizations: readonly OrganizationListItem[]
}

export const SelectOrgClient = ({
  organizations,
}: SelectOrgClientProps) => {
  const router = useRouter()
  const [isSettingActiveOrgId, setIsSettingActiveOrgId] = useState<
    string | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const sortedOrganizations = useMemo(() => {
    return [...organizations].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [organizations])

  const onSelectOrganization = async (organizationId: string) => {
    setIsSettingActiveOrgId(organizationId)
    setError(null)

    try {
      await authClient.organization.setActive({ organizationId })
      router.push('/')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to set active organization'
      )
    } finally {
      setIsSettingActiveOrgId(null)
    }
  }

  const hasOrganizations = sortedOrganizations.length > 0

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Select an organization</CardTitle>
          <CardDescription>
            Choose which organization you want to use right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasOrganizations ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You don’t belong to any organizations yet.
              </p>
              <Button asChild className="w-full">
                <Link href="/create-org">Create an organization</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedOrganizations.map((org) => (
                <Button
                  key={org.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => onSelectOrganization(org.id)}
                  disabled={isSettingActiveOrgId !== null}
                >
                  <span className="truncate">{org.name}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {org.slug}
                  </span>
                </Button>
              ))}

              <div className="pt-4">
                <Button asChild className="w-full">
                  <Link href="/create-org">
                    Create new organization
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
