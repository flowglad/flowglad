import { redirect } from 'next/navigation'

const HomePage = async ({
  params,
}: {
  params: Promise<{ organizationId: string; externalId: string }>
}) => {
  const { organizationId } = await params
  redirect(
    `${process.env.API_BASE_URL}/billing-portal/${organizationId}`
  )
  return <div>Home Page</div>
}

export default HomePage
