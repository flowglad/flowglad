import { Product, Variant } from '@flowglad/types'
import { Button, ButtonProps } from './ui/button'
import { FeatureList } from './feature-list'
import { cn } from '../lib/utils'
import { PriceLabel } from './currency-label'

interface PricingTableProduct
  extends Pick<Product, 'name' | 'description' | 'displayFeatures'> {
  primaryButtonText: string
  secondaryButtonText?: string
  variants: Pick<
    Variant,
    | 'currency'
    | 'unitPrice'
    | 'intervalCount'
    | 'intervalUnit'
    | 'priceType'
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
      onClick={onClick}
      variant={variant}
      disabled={disabled}
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
          variant={product.variants[0]}
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
  return (
    <div className="flex flex-row gap-4 w-full">
      {products.map((product, index) => (
        <PricingTableProductColumn key={index} product={product} />
      ))}
      <div className="flowglad-debug hover:flowglad-bg-blue-500">
        Debug Test 1
      </div>
      <div className="flowglad-test">Debug Test 2</div>
    </div>
  )
}
