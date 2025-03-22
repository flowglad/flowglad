import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  selectCatalogById,
  selectCatalogs,
} from '@/db/tableMethods/catalogMethods'
import { selectPricesAndProductsByProductWhere } from '@/db/tableMethods/priceMethods'
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

  const productsWithPrices = await authenticatedTransaction(
    async ({ transaction }) => {
      return selectPricesAndProductsByProductWhere(
        { catalogId: catalog.id },
        transaction
      )
    }
  )

  return (
    <InnerCatalogDetailsPage
      products={productsWithPrices}
      catalog={catalog}
    />
  )
}

export default CatalogPage
