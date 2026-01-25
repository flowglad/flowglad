'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export default function CreateOrgPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await authClient.organization.create({
        name: orgName,
        slug: orgSlug,
      })

      if (error) {
        setError(error.message || 'Failed to create organization')
      } else if (data) {
        console.log('Organization created:', data)
        // Set the newly created org as active
        await authClient.organization.setActive({
          organizationId: data.id,
        })
        router.push('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-xl font-semibold">
        Create Organization
      </h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Organization Name"
          className="w-full rounded border px-3 py-2"
          required
        />
        <input
          value={orgSlug}
          onChange={(e) => setOrgSlug(e.target.value)}
          placeholder="Slug (e.g., my-company)"
          className="w-full rounded border px-3 py-2"
          required
        />
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Creating…' : 'Create Organization'}
        </Button>
      </form>
    </div>
  )
}
