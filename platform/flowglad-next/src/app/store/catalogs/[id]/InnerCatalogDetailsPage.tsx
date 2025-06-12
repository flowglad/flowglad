// Generated with Ion on 11/15/2024, 6:09:53 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1210:41903
'use client'
import Button from '@/components/ion/Button'
import { ProductsTable } from '@/app/store/products/ProductsTable'
import { Catalog } from '@/db/schema/catalogs'
import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'
import { Ellipsis, Pencil, Plus } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ion/Popover'
import PopoverMenu, {
  PopoverMenuItem,
} from '@/components/PopoverMenu'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import core from '@/utils/core'
import EditCatalogModal from '@/components/forms/EditCatalogModal'
import CustomersTable from '@/app/customers/CustomersTable'
import TableTitle from '@/components/ion/TableTitle'
import FeaturesTable from '@/app/features/FeaturesTable'

export type InnerCatalogDetailsPageProps = {
  catalog: Catalog.ClientRecord
}

function InnerCatalogDetailsPage({
  catalog,
}: InnerCatalogDetailsPageProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <div className="flex flex-row items-center justify-between">
            <div className="min-w-0 overflow-hidden mr-4">
              <PageTitle className="truncate whitespace-nowrap overflow-hidden text-ellipsis">
                {catalog.name}
              </PageTitle>
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
              // TODO: Implement create product functionality
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
              // TODO: Implement create feature functionality
            }}
          />
          <FeaturesTable filters={{ catalogId: catalog.id }} />
        </div>
      </div>
      <EditCatalogModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        catalog={catalog}
      />
    </InternalPageContainer>
  )
}

export default InnerCatalogDetailsPage
