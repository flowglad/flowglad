'use client'
import { PageHeader } from '@/components/ion/PageHeader'
import CatalogsTable from './CatalogsTable'
import Button from '@/components/ion/Button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Catalog } from '@/db/schema/catalogs'
import CreateCatalogModal from '@/components/forms/CreateCatalogModal'

const InnerCatalogsPage = ({
  catalogs,
}: {
  catalogs: Catalog.TableRow[]
}) => {
  const [isCreateCatalogOpen, setIsCreateCatalogOpen] =
    useState(false)
  return (
    <div className="bg-container h-full flex justify-between items-center">
      <div className="bg-internal flex-1 h-full w-full flex gap-6 p-6">
        <div className="flex-1 h-full w-full flex flex-col">
          <div className="w-full relative flex flex-col justify-center gap-8">
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
                  Component: () => <CatalogsTable data={catalogs} />,
                },
              ]}
            />
          </div>
        </div>
      </div>
      {isCreateCatalogOpen && (
        <CreateCatalogModal
          isOpen={isCreateCatalogOpen}
          setIsOpen={setIsCreateCatalogOpen}
        />
      )}
    </div>
  )
}

export default InnerCatalogsPage
