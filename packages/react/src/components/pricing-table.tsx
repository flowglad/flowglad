'use client'
import { Product, Price } from '@flowglad/types'
import { Button, ButtonProps } from './ui/button'
import { FeatureList } from './feature-list'
import { cn } from '../lib/utils'
import { PriceLabel } from './currency-label'
import { useState } from 'react'
import { useFlowgladTheme } from '../FlowgladTheme'

interface PricingTableProduct
  extends Pick<Product, 'name' | 'description' | 'displayFeatures'> {
  primaryButtonText: string
  secondaryButtonText?: string
  prices: Pick<
    Price,
    | 'currency'
    | 'unitPrice'
    | 'intervalCount'
    | 'intervalUnit'
    | 'type'
    | 'intervalUnit'
    | 'trialPeriodDays'
  >[]
  disabled?: boolean
  href?: string
  highlight?: boolean
  onClickPrimaryButton?: () => void
  onClickSecondaryButton?: () => void
}

interface PricingTableProps {
  products: PricingTableProduct[]
}

function PricingTableButton({
  onClick,
  href,
  children,
  type,
  size,
  variant,
  disabled,
}: {
  onClick?: () => void
  href?: string
  children: React.ReactNode
  type: ButtonProps['type']
  size: ButtonProps['size']
  variant?: ButtonProps['variant']
  disabled?: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)
  if (href) {
    return (
      <a href={href} target="_blank" className="flex w-full">
        <Button
          type={type}
          size={size}
          onClick={onClick}
          disabled={disabled}
          className="w-full"
        >
          {children}
        </Button>
      </a>
    )
  }
  return (
    <Button
      type={type}
      size={size}
      onClick={async () => {
        if (disabled) {
          return
        }
        setIsLoading(true)
        await onClick?.()
        setIsLoading(false)
      }}
      variant={variant}
      disabled={disabled || isLoading}
    >
      {children}
    </Button>
  )
}

function PricingTableProductColumn({
  product,
}: {
  product: PricingTableProps['products'][number]
  highlight?: boolean
}) {
  return (
    <div
      key={product.name}
      className={cn(
        'flowglad-flex flowglad-flex-1 flowglad-flex-col flowglad-gap-6 flowglad-rounded-lg flowglad-p-4',
        product.highlight && 'flowglad-bg-accent'
      )}
    >
      <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
        <h3 className="flowglad-text-2xl flowglad-font-bold">
          {product.name}
        </h3>
        <PriceLabel
          price={product.prices[0]}
          className="flowglad-text-lg flowglad-text-muted-foreground"
        />
        {product.description && (
          <p className="flowglad-text-sm flowglad-text-muted-foreground">
            {product.description}
          </p>
        )}
      </div>
      {product.displayFeatures && (
        <FeatureList features={product.displayFeatures} />
      )}
      <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
        <PricingTableButton
          type="button"
          size="sm"
          onClick={product.onClickPrimaryButton}
          disabled={product.disabled}
          href={product.href}
        >
          {product.primaryButtonText}
        </PricingTableButton>
        {product.secondaryButtonText && (
          <PricingTableButton
            type="button"
            size="sm"
            variant="outline"
            onClick={product.onClickSecondaryButton}
          >
            {product.secondaryButtonText}
          </PricingTableButton>
        )}
      </div>
    </div>
  )
}

export function PricingTable({ products }: PricingTableProps) {
  const { themedCn } = useFlowgladTheme()
  return (
    <div className={themedCn()}>
      <div
        className={themedCn(
          'flowglad-flex flowglad-flex-row flowglad-gap-4 flowglad-w-full'
        )}
      >
        {products.map((product, index) => (
          <PricingTableProductColumn key={index} product={product} />
        ))}
      </div>
    </div>
  )
}
