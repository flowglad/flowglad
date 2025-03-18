import { RotateCw } from 'lucide-react'
import { PriceType } from '@/types'
import { Price } from '@/db/schema/prices'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const PricingCellView = ({ prices }: { prices: Price.Record[] }) => {
  if (prices.length === 0) {
    return <div>-</div>
  }

  if (prices.length === 1) {
    const price = prices[0]
    return (
      <div className="flex items-center gap-3">
        {price.type === PriceType.Subscription ? (
          <RotateCw size={16} strokeWidth={2} />
        ) : (
          <></>
        )}
        <div className="w-fit flex flex-col justify-center text-sm font-medium text-foreground">
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            price.currency,
            price.unitPrice
          )}{' '}
          {price.type === PriceType.Subscription
            ? `/ ${price.intervalUnit}`
            : null}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      {prices.length} Prices
    </div>
  )
}

export default PricingCellView
