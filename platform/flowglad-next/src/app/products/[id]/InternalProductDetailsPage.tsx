'use client'
import { Check, Copy } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import EditProductModal from '@/components/forms/EditProductModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuthenticatedContext } from '@/contexts/authContext'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { PricesDataTable } from './prices/data-table'

/**
 * Copyable field component for displaying values with a copy button.
 * Based on Figma design - copy icon is always visible.
 */
function CopyableField({
  value,
  label,
  displayText,
}: {
  value: string
  label: string
  displayText?: string
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="inline-flex items-center gap-1 cursor-pointer group"
            onClick={handleCopy}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleCopy()
              }
            }}
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--jade-muted-foreground))] flex-shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="font-sans font-medium text-sm leading-5 text-muted-foreground group-hover:underline transition-colors">
              {copied && displayText
                ? displayText.replace(/^Copy/, 'Copied')
                : (displayText ?? value)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-sans">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export type InternalProductDetailsPageProps = {
  product: Product.ClientRecord
  prices: Price.ClientRecord[]
  pricingModel: PricingModel.Record
}

function InternalProductDetailsPage(
  props: InternalProductDetailsPageProps
) {
  const { product, prices, pricingModel } = props
  const { organization } = useAuthenticatedContext()
  const router = useRouter()
  const [isCreatePriceOpen, setIsCreatePriceOpen] = useState(false)

  const productURL = `${
    window ? window.location.origin : 'https://app.flowglad.com'
  }/product/${product.id}/purchase`
  const [isEditOpen, setIsEditOpen] = useState(false)

  const copyPurchaseLinkHandler = useCopyTextHandler({
    text: productURL,
  })
  const previewProductHandler = () => {
    window.open(productURL, '_blank')
  }

  const handleBreadcrumbClick = () => {
    router.push(`/pricing-models/${pricingModel.id}`)
  }

  // Build badges array
  const badges = [
    {
      icon: (
        <Check
          className="w-full h-full stroke-current"
          strokeWidth={3}
        />
      ),
      label: 'Active',
      variant: 'active' as const,
    },
    ...(product.default
      ? [
          {
            label: 'Default Product',
            variant: 'muted' as const,
            tooltip:
              'Default products are automatically assigned to customers.',
          },
        ]
      : []),
  ]

  // Build actions array
  const actions = [
    {
      label: 'Edit',
      onClick: () => setIsEditOpen(true),
      variant: 'secondary' as const,
    },
    {
      label: 'Copy Link',
      onClick: () => copyPurchaseLinkHandler(),
      disabled: product.default,
      disabledTooltip: product.default
        ? 'Cannot copy checkout link for default products.'
        : undefined,
      variant: 'secondary' as const,
    },
    {
      label: 'Preview',
      onClick: () => previewProductHandler(),
      disabled: product.default,
      disabledTooltip: product.default
        ? 'Cannot preview checkout for default products.'
        : undefined,
      variant: 'secondary' as const,
    },
  ]

  return (
    <InternalPageContainer>
      <div className="w-full flex flex-col gap-6">
        <PageHeaderNew
          title={product.name}
          breadcrumb={pricingModel.name}
          onBreadcrumbClick={handleBreadcrumbClick}
          badges={badges}
          description={
            <div className="flex items-center gap-2">
              <CopyableField
                value={product.id}
                label="ID"
                displayText="Copy ID"
              />
              {product.slug && (
                <>
                  <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
                  <CopyableField
                    value={product.slug}
                    label="Slug"
                    displayText="Copy Slug"
                  />
                </>
              )}
            </div>
          }
          actions={actions}
        />
        <div className="w-full min-w-40 flex flex-col gap-4">
          <div className="min-w-40 flex flex-col gap-5 pb-5">
            <DateRangeRevenueChart
              organizationCreatedAt={
                organization?.createdAt
                  ? new Date(organization.createdAt)
                  : new Date()
              }
              alignDatePicker="left"
              productId={product.id}
            />
          </div>
        </div>
        <PricesDataTable
          title="Price History"
          productId={product.id}
          filters={{
            productId: product.id,
          }}
          onCreatePrice={
            product.default
              ? undefined
              : () => setIsCreatePriceOpen(true)
          }
        />
        <CreatePriceModal
          isOpen={isCreatePriceOpen}
          setIsOpen={setIsCreatePriceOpen}
          productId={product.id}
          previousPrice={prices[prices.length - 1]}
        />
      </div>
      <EditProductModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        product={product}
        prices={prices}
      />
    </InternalPageContainer>
  )
}

export default InternalProductDetailsPage
