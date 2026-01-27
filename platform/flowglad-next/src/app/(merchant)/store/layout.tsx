import SidebarLayout from '@/components/SidebarLayout'

const CatalogLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return <SidebarLayout>{children}</SidebarLayout>
}

export default CatalogLayout
