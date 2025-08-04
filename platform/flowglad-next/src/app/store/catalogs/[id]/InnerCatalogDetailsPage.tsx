// Generated with Ion on 11/15/2024, 6:09:53 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1210:41903
'use client'
import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Catalog } from '@/db/schema/catalogs'
import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import TableTitle from '@/components/ion/TableTitle'
import DefaultBadge from '@/components/DefaultBadge'
import ProductsTable from '@/app/store/products/ProductsTable'
import CustomersTable from '@/app/store/customers/CustomersTable'
import FeaturesTable from '@/app/store/features/FeaturesTable'
import UsageMetersTable from '@/app/store/usage-meters/UsageMetersTable'
import EditCatalogModal from '@/components/forms/EditCatalogModal'
import CreateProductModal from '@/components/forms/CreateProductModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'

export type InnerCatalogDetailsPageProps = {
  catalog: Catalog.ClientRecord
}

function InnerCatalogDetailsPage({
  catalog,
}: InnerCatalogDetailsPageProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] =
    useState(false)
  const [isCreateFeatureModalOpen, setIsCreateFeatureModalOpen] =
    useState(false)
  const [
    isCreateUsageMeterModalOpen,
    setIsCreateUsageMeterModalOpen,
  ] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-2 min-w-0 overflow-hidden mr-4">
              <PageTitle className="truncate whitespace-nowrap overflow-hidden text-ellipsis">
                {catalog.name}
              </PageTitle>
              {catalog.isDefault && <DefaultBadge />}
            </div>
            <div className="flex flex-row gap-4 justify-end flex-shrink-0">
              <Button
                iconLeading={<Pencil size={16} />}
                onClick={() => setIsEditOpen(true)}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <TableTitle
            title="Products"
            buttonLabel="Create Product"
            buttonIcon={<Plus size={16} />}
            buttonOnClick={() => {
              setIsCreateProductModalOpen(true)
            }}
          />
          <ProductsTable filters={{ catalogId: catalog.id }} />
        </div>
        <div className="flex flex-col gap-5">
          <TableTitle title="Customers" noButtons />
          <CustomersTable filters={{ catalogId: catalog.id }} />
        </div>
        <div className="flex flex-col gap-5">
          <TableTitle
            title="Features"
            buttonLabel="Create Feature"
            buttonIcon={<Plus size={16} />}
            buttonOnClick={() => {
              setIsCreateFeatureModalOpen(true)
            }}
          />
          <FeaturesTable filters={{ catalogId: catalog.id }} />
        </div>
        <div className="flex flex-col gap-5">
          <TableTitle
            title="Usage Meters"
            buttonLabel="Create Usage Meter"
            buttonIcon={<Plus size={16} />}
            buttonOnClick={() => {
              setIsCreateUsageMeterModalOpen(true)
            }}
          />
          <UsageMetersTable filters={{ catalogId: catalog.id }} />
        </div>
      </div>
      <EditCatalogModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        catalog={catalog}
      />
      <CreateProductModal
        isOpen={isCreateProductModalOpen}
        setIsOpen={setIsCreateProductModalOpen}
        defaultCatalogId={catalog.id}
      />
      <CreateFeatureModal
        isOpen={isCreateFeatureModalOpen}
        setIsOpen={setIsCreateFeatureModalOpen}
        defaultCatalogId={catalog.id}
      />
      <CreateUsageMeterModal
        isOpen={isCreateUsageMeterModalOpen}
        setIsOpen={setIsCreateUsageMeterModalOpen}
      />
    </InternalPageContainer>
  )
}

export default InnerCatalogDetailsPage
