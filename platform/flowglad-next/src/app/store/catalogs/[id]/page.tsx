import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCatalogs } from '@/db/tableMethods/pricingModelMethods'
import InnerCatalogDetailsPage from './InnerCatalogDetailsPage'

interface CatalogPageProps {
  params: Promise<{ id: string }>
}

const CatalogPage = async ({ params }: CatalogPageProps) => {
  const { id } = await params
  const catalog = await authenticatedTransaction(
    async ({ transaction }) => {
      const [catalog] = await selectCatalogs({ id }, transaction)
      return catalog
    }
  )

  if (!catalog) {
    notFound()
  }

  return <InnerCatalogDetailsPage catalog={catalog} />
}

export default CatalogPage
