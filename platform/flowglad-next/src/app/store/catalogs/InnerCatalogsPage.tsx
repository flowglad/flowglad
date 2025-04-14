'use client'
import { PageHeader } from '@/components/ion/PageHeader'
import CatalogsTable from './CatalogsTable'
import Button from '@/components/ion/Button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import CreateCatalogModal from '@/components/forms/CreateCatalogModal'
import InnerPageContainer from '@/components/InternalPageContainer'

const InnerCatalogsPage = () => {
  const [isCreateCatalogOpen, setIsCreateCatalogOpen] =
    useState(false)
  return (
    <InnerPageContainer>
      <PageHeader
        hideTabs
        title={'Catalogs'}
        primaryButton={
          <Button
            iconLeading={<Plus size={16} />}
            onClick={() => setIsCreateCatalogOpen(true)}
          >
            Create Catalog
          </Button>
        }
        tabs={[
          {
            label: 'Products',
            subPath: 'products',
            Component: () => <CatalogsTable />,
          },
        ]}
      />
      {isCreateCatalogOpen && (
        <CreateCatalogModal
          isOpen={isCreateCatalogOpen}
          setIsOpen={setIsCreateCatalogOpen}
        />
      )}
    </InnerPageContainer>
  )
}

export default InnerCatalogsPage
