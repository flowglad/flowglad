import Internal from './Internal'

interface ProductsPageProps {
  searchParams: Promise<{ pricingModelId?: string }>
}

const ProductsPage = async ({ searchParams }: ProductsPageProps) => {
  const { pricingModelId } = await searchParams
  return <Internal pricingModelId={pricingModelId} />
}

export default ProductsPage
