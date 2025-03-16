import { redirect } from 'next/navigation'

/**
 * Redirects /catalog to /store
 *
 * We do this because store section used to be under /catalog.
 */
const CatalogPage = async ({
  params,
}: {
  params: Promise<{ rest: string[] }>
}) => {
  const { rest } = await params
  const dynamicPath = rest.join('/')
  const newPath = `/store/${dynamicPath}`
  redirect(newPath)
}

export default CatalogPage
