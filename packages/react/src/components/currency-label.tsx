import { cn, humanReadableCurrencyAmount } from '../lib/utils'
import {
  CurrencyCode,
  SubscriptionVariant,
  Variant,
} from '@flowglad/types'

export const CurrencyLabel = ({
  currency,
  amount,
  className,
}: {
  currency: CurrencyCode
  amount: number
  className?: string
}) => {
  return (
    <div className={cn(className)}>
      {humanReadableCurrencyAmount(currency, amount)}
    </div>
  )
}

export const intervalLabel = (
  purchase: Pick<
    SubscriptionVariant,
    'intervalCount' | 'intervalUnit'
  >
) => {
  const intervalCount = purchase?.intervalCount ?? 1
  const intervalUnit = purchase?.intervalUnit ?? 'month'
  const intervalLabel =
    intervalCount > 1
      ? `${intervalCount} ${intervalUnit}s`
      : `${intervalUnit}`
  return `every ${intervalLabel}`
}

export const PriceLabel = ({
  variant,
  className,
}: {
  variant: Pick<
    Variant,
    | 'currency'
    | 'unitPrice'
    | 'intervalCount'
    | 'intervalUnit'
    | 'priceType'
  >
  className?: string
}) => {
  if (variant.priceType === 'subscription') {
    return (
      <div className={cn(className)} id="lol">
        {humanReadableCurrencyAmount(
          variant.currency,
          variant.unitPrice
        )}{' '}
        per {(variant as SubscriptionVariant).intervalUnit}
      </div>
    )
  }

  return (
    <div className={cn(className)} id="lol2">
      {humanReadableCurrencyAmount(
        variant.currency,
        variant.unitPrice
      )}
    </div>
  )
}
