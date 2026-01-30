import SidebarLayout from '@/components/SidebarLayout'

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SidebarLayout>{children}</SidebarLayout>
}
