import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Standard container for dashboard page content.
 *
 * Width is controlled by the parent SidebarProvider.
 * This component provides:
 * - Flex column layout for page structure
 * - Dashed right border for visual consistency
 * - Full height/width within the sidebar constraint
 *
 * @example
 * <PageContainer>
 *   <PageHeaderNew title="Dashboard" />
 *   <DashboardContent />
 * </PageContainer>
 */
const PageContainer = ({
  children,
  className,
}: PageContainerProps) => {
  return (
    <div
      className={cn(
        'h-full w-full flex-1 flex flex-col md:border-r md:border-dashed border-sidebar-border',
        className
      )}
    >
      {children}
    </div>
  )
}

export default PageContainer
