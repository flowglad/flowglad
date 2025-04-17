import { cn, humanReadableCurrencyAmount } from '../lib/utils'
import {
  CurrencyCode,
  SubscriptionPrice,
  Price,
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
  purchase: Pick<SubscriptionPrice, 'intervalCount' | 'intervalUnit'>
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
  price,
  className,
}: {
  price: Pick<
    Price,
    | 'currency'
    | 'unitPrice'
    | 'intervalCount'
    | 'intervalUnit'
    | 'type'
  >
  className?: string
}) => {
  if (price.type === 'subscription') {
    return (
      <div className={cn(className)}>
        {humanReadableCurrencyAmount(price.currency, price.unitPrice)}{' '}
        per {(price as SubscriptionPrice).intervalUnit}
      </div>
    )
  }

  return (
    <div className={cn(className)}>
      {humanReadableCurrencyAmount(price.currency, price.unitPrice)}
    </div>
  )
}
