import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

/**
 * ProductCard variants configuration
 *
 * Defines the visual states for product cards including default, hover,
 * and different card types (default, see all, subscription)
 */
const productCardVariants = cva(
  'relative box-border rounded-md border transition-colors duration-200 w-full',
  {
    variants: {
      variant: {
        default: '',
        'see-all': '',
        subscription: '',
      },
      state: {
        default: 'bg-background border-border',
        hover: 'bg-accent border-muted-foreground',
      },
      clickable: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      state: 'default',
      clickable: false,
    },
  }
)

export interface ProductCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'>,
    VariantProps<typeof productCardVariants> {
  /** The name of the product */
  productName: string
  /** The status of the product (e.g., "Active", "Paused") */
  productStatus?: string
  /** The price amount */
  price: string | number
  /** The billing period (e.g., "month", "year") */
  period: string
  /** Optional currency symbol, defaults to "$" */
  currencySymbol?: string
  /** Optional href to make the card a link */
  href?: string
  /** Optional onClick handler when card is not a link */
  onClick?: () => void
  /** Optional quantity for subscription variant */
  quantity?: number
  /** Optional renewal date for subscription variant */
  renewalDate?: string
}

/**
 * ProductCard component
 *
 * Displays product information including name, status, and pricing.
 * Based on Flowglad Design System with support for multiple variants
 * and hover states. Can be made clickable by providing href or onClick.
 *
 * @example
 * ```tsx
 * <ProductCard
 *   productName="Pro Plan"
 *   productStatus="Active"
 *   price={99}
 *   period="month"
 *   variant="default"
 *   href="/store/products/prod_123"
 * />
 * ```
 */
const ProductCard = React.forwardRef<
  HTMLDivElement,
  ProductCardProps
>(
  (
    {
      className,
      variant,
      state,
      productName,
      productStatus,
      price,
      period,
      currencySymbol = '$',
      href,
      onClick,
      quantity,
      renewalDate,
      ...props
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false)
    const currentState = isHovered ? 'hover' : state
    const isClickable = Boolean(href || onClick)
    const isSubscriptionVariant = variant === 'subscription'

    const showQuantityBadge = Boolean(
      isSubscriptionVariant && quantity && quantity > 1
    )

    const content = (
      <div className="flex flex-col gap-4 px-3 py-2.5">
        {/* Card Header */}
        <ProductCardHeader>
          {showQuantityBadge && quantity ? (
            <div className="flex gap-1.5 items-center w-full">
              <ProductCardTitle>{productName}</ProductCardTitle>
              <ProductCardQuantityBadge quantity={quantity} />
            </div>
          ) : (
            <ProductCardTitle>{productName}</ProductCardTitle>
          )}
          {isSubscriptionVariant && renewalDate ? (
            <ProductCardRenewalDate>
              {renewalDate}
            </ProductCardRenewalDate>
          ) : (
            productStatus && (
              <ProductCardStatus>{productStatus}</ProductCardStatus>
            )
          )}
        </ProductCardHeader>

        {/* Price Wrapper */}
        <ProductCardPrice
          price={price}
          period={period}
          currencySymbol={currencySymbol}
          showTotal={showQuantityBadge}
        />
      </div>
    )

    const cardClassName = cn(
      productCardVariants({
        variant,
        state: currentState,
        clickable: isClickable,
      }),
      className
    )

    const commonProps = {
      'data-slot': 'product-card',
      'data-variant': variant,
      'data-state': currentState,
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    }

    // If href is provided, wrap in Link
    if (href) {
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={cardClassName}
          {...commonProps}
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </Link>
      )
    }

    // If onClick is provided, make it a button-like div
    if (onClick) {
      return (
        <div
          ref={ref}
          className={cardClassName}
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClick()
            }
          }}
          {...commonProps}
          {...props}
        >
          {content}
        </div>
      )
    }

    // Default: non-interactive card
    return (
      <div
        ref={ref}
        className={cardClassName}
        {...commonProps}
        {...props}
      >
        {content}
      </div>
    )
  }
)
ProductCard.displayName = 'ProductCard'

/**
 * ProductCardHeader - Contains the title and status
 */
interface ProductCardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const ProductCardHeader = React.forwardRef<
  HTMLDivElement,
  ProductCardHeaderProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="product-card-header"
      className={cn('flex flex-col gap-0.5 w-full', className)}
      {...props}
    />
  )
})
ProductCardHeader.displayName = 'ProductCardHeader'

/**
 * ProductCardTitle - The product name
 */
interface ProductCardTitleProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

const ProductCardTitle = React.forwardRef<
  HTMLParagraphElement,
  ProductCardTitleProps
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="product-card-title"
      className={cn(
        'font-sans font-medium text-base leading-6 text-card-foreground whitespace-nowrap',
        className
      )}
      {...props}
    />
  )
})
ProductCardTitle.displayName = 'ProductCardTitle'

/**
 * ProductCardStatus - The product status text
 */
interface ProductCardStatusProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

const ProductCardStatus = React.forwardRef<
  HTMLParagraphElement,
  ProductCardStatusProps
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="product-card-status"
      className={cn(
        'font-sans font-normal text-sm leading-none text-muted-foreground whitespace-nowrap',
        className
      )}
      {...props}
    />
  )
})
ProductCardStatus.displayName = 'ProductCardStatus'

/**
 * ProductCardQuantityBadge - Shows quantity for subscription variant
 */
interface ProductCardQuantityBadgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  quantity: number
}

const ProductCardQuantityBadge = React.forwardRef<
  HTMLDivElement,
  ProductCardQuantityBadgeProps
>(({ className, quantity, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="product-card-quantity-badge"
      className={cn(
        'bg-secondary flex items-center justify-center h-4 px-1 py-0 rounded-[999px] shrink-0',
        className
      )}
      {...props}
    >
      <p className="font-mono font-semibold text-xs leading-none text-foreground text-center whitespace-nowrap">
        x{quantity}
      </p>
    </div>
  )
})
ProductCardQuantityBadge.displayName = 'ProductCardQuantityBadge'

/**
 * ProductCardRenewalDate - Shows renewal date for subscription variant
 */
interface ProductCardRenewalDateProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

const ProductCardRenewalDate = React.forwardRef<
  HTMLParagraphElement,
  ProductCardRenewalDateProps
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="product-card-renewal-date"
      className={cn(
        'font-sans font-normal text-sm leading-none text-muted-foreground whitespace-nowrap',
        className
      )}
      {...props}
    />
  )
})
ProductCardRenewalDate.displayName = 'ProductCardRenewalDate'

/**
 * ProductCardPrice - Displays the price with period
 */
interface ProductCardPriceProps
  extends React.HTMLAttributes<HTMLDivElement> {
  price: string | number
  period: string
  currencySymbol?: string
  /** When true, displays "(total)" after the period to indicate aggregated pricing */
  showTotal?: boolean
}

const ProductCardPrice = React.forwardRef<
  HTMLDivElement,
  ProductCardPriceProps
>(
  (
    {
      className,
      price,
      period,
      currencySymbol = '$',
      showTotal = false,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        data-slot="product-card-price"
        className={cn(
          'flex items-center leading-none w-full whitespace-nowrap',
          className
        )}
        {...props}
      >
        {/* Price Amount */}
        <span className="font-heading font-medium text-2xl leading-none text-card-foreground">
          {currencySymbol}
          {price}
        </span>

        {/* Separator */}
        <span className="font-sans font-medium text-base leading-6 text-muted-foreground">
          /
        </span>

        {/* Period */}
        <span className="font-sans font-medium text-base leading-6 text-muted-foreground">
          {period}
        </span>

        {/* Total indicator for multi-quantity items */}
        {showTotal && (
          <span className="font-sans font-normal text-base leading-6 text-muted-foreground ml-1">
            (total)
          </span>
        )}
      </div>
    )
  }
)
ProductCardPrice.displayName = 'ProductCardPrice'

export {
  ProductCard,
  ProductCardHeader,
  ProductCardTitle,
  ProductCardStatus,
  ProductCardQuantityBadge,
  ProductCardRenewalDate,
  ProductCardPrice,
  productCardVariants,
}
