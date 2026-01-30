import SidebarLayout from '@/components/SidebarLayout'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarLayout>
      <TooltipProvider delayDuration={300}>
        {children}
      </TooltipProvider>
    </SidebarLayout>
  )
}
