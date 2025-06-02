'use client'
import PageTitle from '@/components/ion/PageTitle'
import CatalogsTable from './CatalogsTable'
import InternalPageContainer from '@/components/InternalPageContainer'
import CreateCatalogModal from '@/components/forms/CreateCatalogModal'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ion/Button'
import Breadcrumb from '@/components/navigation/Breadcrumb'

const InnerCatalogsPage = () => {
  const [isCreateCatalogOpen, setIsCreateCatalogOpen] =
    useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between items-center mb-6 gap-8">
          <PageTitle>Catalogs</PageTitle>
          <Button
            onClick={() => setIsCreateCatalogOpen(true)}
            iconLeading={<Plus size={16} strokeWidth={2} />}
          >
            Create Catalog
          </Button>
        </div>
        <CatalogsTable />
      </div>
      <CreateCatalogModal
        isOpen={isCreateCatalogOpen}
        setIsOpen={setIsCreateCatalogOpen}
      />
    </InternalPageContainer>
  )
}

export default InnerCatalogsPage
