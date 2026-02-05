'use client'

import { RevenueChartIntervalUnit } from '@db-core/enums'
import { endOfDay, startOfDay, subMonths } from 'date-fns'
import {
  BatteryMedium,
  Box,
  CircleCheck,
  Plus,
  Shapes,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { ChartDivider, ChartGrid } from '@/components/charts'
import CreateResourceModal from '@/components/components/CreateResourceModal'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { DashboardChart } from '@/components/DashboardChart'
import CreateCustomerFormModal from '@/components/forms/CreateCustomerFormModal'
import CreateFeatureModal from '@/components/forms/CreateFeatureModal'
import CreateProductModal from '@/components/forms/CreateProductModal'
import { CustomersIcon } from '@/components/icons/navigation'
import PageContainer from '@/components/PageContainer'
import PopoverMenu, {
  type PopoverMenuItem,
} from '@/components/PopoverMenu'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { IntervalPicker } from '@/components/ui/interval-picker'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ProductPicker } from '@/components/ui/product-picker'
import { useAuthContext } from '@/contexts/authContext'
import { getIntervalConfig } from '@/utils/chartIntervalUtils'

export interface DashboardPageProps {
  organizationCreatedAt: Date
}

function InternalDashboardPage({
  organizationCreatedAt,
}: DashboardPageProps) {
  const { user } = useAuthContext()
  const firstName = user?.name?.split(' ')[0]
  const greeting = firstName
    ? `Hello, ${firstName}`
    : 'Hello there :)'
  const today = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: subMonths(today, 12),
    to: todayEnd,
  })

  // Global interval state for all charts
  const [interval, setInterval] = useState<RevenueChartIntervalUnit>(
    () => getIntervalConfig(range.from, range.to).default
  )

  // Product filter state (local only, not persisted to URL)
  const [productId, setProductId] = useState<string | null>(null)

  // Quick create popover and modal state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] =
    useState(false)
  const [hidePricingModelSelect, setHidePricingModelSelect] =
    useState(false)
  const [snapshotPricingModelId, setSnapshotPricingModelId] =
    useState('')
  const [isCreateFeatureModalOpen, setIsCreateFeatureModalOpen] =
    useState(false)
  const [
    isCreateUsageMeterModalOpen,
    setIsCreateUsageMeterModalOpen,
  ] = useState(false)
  const [isCreateResourceModalOpen, setIsCreateResourceModalOpen] =
    useState(false)
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] =
    useState(false)

  // Get focused pricing model for create modals
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const focusedPricingModelId =
    focusedMembership.data?.pricingModel?.id ?? ''

  // Auto-correct interval when date range changes if it becomes invalid
  useEffect(() => {
    const config = getIntervalConfig(range.from, range.to)
    setInterval((prev) =>
      config.options.includes(prev) ? prev : config.default
    )
  }, [range.from, range.to])

  const quickCreateMenuItems: PopoverMenuItem[] = [
    {
      label: 'Create Product',
      handler: () => {
        setIsPopoverOpen(false)
        // Snapshot both values at open time to ensure consistency
        setSnapshotPricingModelId(focusedPricingModelId)
        setHidePricingModelSelect(Boolean(focusedPricingModelId))
        setIsCreateProductModalOpen(true)
      },
      icon: <Shapes className="h-4 w-4" />,
    },
    {
      label: 'Create Feature',
      handler: () => {
        setIsPopoverOpen(false)
        setIsCreateFeatureModalOpen(true)
      },
      icon: <CircleCheck className="h-4 w-4" />,
    },
    {
      label: 'Create Usage Meter',
      handler: () => {
        setIsPopoverOpen(false)
        setIsCreateUsageMeterModalOpen(true)
      },
      icon: <BatteryMedium className="h-4 w-4" />,
    },
    {
      label: 'Create Resource',
      handler: () => {
        setIsPopoverOpen(false)
        setIsCreateResourceModalOpen(true)
      },
      icon: <Box className="h-4 w-4" />,
    },
    {
      label: 'Create Customer',
      handler: () => {
        setIsPopoverOpen(false)
        setIsCreateCustomerModalOpen(true)
      },
      icon: <CustomersIcon className="h-4 w-4" />,
    },
  ]

  return (
    <PageContainer>
      <PageHeaderNew
        title={greeting}
        className="pb-2"
        description={
          <div className="-ml-4 flex flex-1 flex-wrap items-center justify-between gap-y-2">
            <div className="flex flex-wrap items-center">
              <DateRangePicker
                fromDate={range.from}
                toDate={range.to}
                maxDate={new Date()}
                onSelect={(newRange) => {
                  if (newRange?.from && newRange?.to) {
                    setRange({ from: newRange.from, to: newRange.to })
                  }
                }}
              />
              <IntervalPicker
                value={interval}
                onValueChange={setInterval}
                fromDate={range.from}
                toDate={range.to}
              />
              <div className="hidden sm:block">
                <ProductPicker
                  value={productId}
                  onValueChange={setProductId}
                />
              </div>
            </div>
            <Popover
              open={isPopoverOpen}
              onOpenChange={setIsPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  className="aspect-square"
                  aria-label="Open quick create menu"
                >
                  <Plus />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-fit p-1" align="end">
                <PopoverMenu items={quickCreateMenuItems} />
              </PopoverContent>
            </Popover>
          </div>
        }
      />
      {/* 
        Content container uses edge-to-edge divider pattern:
        - NO gap between items
        - Padding on individual sections for spacing
        - Allows ChartDivider to span full width while content is inset
      */}
      <div className="w-full flex flex-col pb-16">
        {/* Primary Chart - Full Size with metric selector */}
        <div className="py-6">
          <DashboardChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            productId={productId}
            size="lg"
            availableMetrics={['revenue', 'mrr', 'subscribers']}
            defaultMetric="revenue"
          />
        </div>

        <ChartDivider />

        {/* Secondary Charts - Compact Grid with metric selectors */}
        <ChartGrid>
          <DashboardChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            productId={productId}
            size="sm"
            availableMetrics={['mrr', 'subscribers']}
            defaultMetric="mrr"
          />
          <DashboardChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            productId={productId}
            size="sm"
            availableMetrics={['subscribers', 'mrr']}
            defaultMetric="subscribers"
          />
        </ChartGrid>
      </div>

      <CreateProductModal
        isOpen={isCreateProductModalOpen}
        setIsOpen={setIsCreateProductModalOpen}
        defaultPricingModelId={snapshotPricingModelId}
        hidePricingModelSelect={hidePricingModelSelect}
      />
      <CreateFeatureModal
        isOpen={isCreateFeatureModalOpen}
        setIsOpen={setIsCreateFeatureModalOpen}
        defaultPricingModelId={focusedPricingModelId}
      />
      <CreateUsageMeterModal
        isOpen={isCreateUsageMeterModalOpen}
        setIsOpen={setIsCreateUsageMeterModalOpen}
        defaultPricingModelId={focusedPricingModelId}
      />
      <CreateResourceModal
        isOpen={isCreateResourceModalOpen}
        setIsOpen={setIsCreateResourceModalOpen}
        defaultPricingModelId={focusedPricingModelId}
      />
      <CreateCustomerFormModal
        isOpen={isCreateCustomerModalOpen}
        setIsOpen={setIsCreateCustomerModalOpen}
      />
    </PageContainer>
  )
}

export default InternalDashboardPage
