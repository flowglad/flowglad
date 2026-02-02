import { redirect } from 'next/navigation'

interface DevicePageProps {
  searchParams: Promise<{ user_code?: string }>
}

/**
 * Redirect page from Better Auth's default /device URL to our custom /cli/authorize page.
 *
 * Better Auth's Device Authorization plugin hardcodes verification_uri to /device.
 * This page handles that by redirecting to our custom authorization UI at /cli/authorize.
 */
export default async function DevicePage({
  searchParams,
}: DevicePageProps) {
  const params = await searchParams
  const userCode = params.user_code

  if (userCode) {
    redirect(
      `/cli/authorize?user_code=${encodeURIComponent(userCode)}`
    )
  }

  redirect('/cli/authorize')
}
