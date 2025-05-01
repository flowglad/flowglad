export const IS_DEV = process.env.VERCEL_ENV === 'development'

export const portalRoute = (params: {
  organizationId: string
  customerExternalId: string
  page: 'sign-in' | 'manage'
}) => {
  const routeResult = `/p/${params.organizationId}/${params.customerExternalId}/${params.page}`
  return routeResult
}
