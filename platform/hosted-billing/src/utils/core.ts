export const IS_DEV = process.env.VERCEL_ENV === 'development'

export const portalRoute = (params: {
  organizationId: string
  customerExternalId: string
  page: 'sign-in' | 'manage' | 'validate-magic-link'
}) => {
  console.log('portalRoute', {
    organizationId: params.organizationId,
    customerExternalId: params.customerExternalId,
    page: params.page,
  })
  const routeResult = `/p/${params.organizationId}/${params.customerExternalId}/${params.page}`
  console.log('routeResult', {
    routeResult,
  })
  return routeResult
}
