import { PriceType } from '@/types'
import { Price } from '@/db/schema/prices'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const PricingCellView = ({
  prices,
}: {
  prices: Price.ClientRecord[]
}) => {
  if (prices.length === 0) {
    return <div>-</div>
  }

  if (prices.length === 1) {
    const price = prices[0]

    // Helper function to shorten time periods
    const getShortenedIntervalUnit = (intervalUnit: string) => {
      switch (intervalUnit) {
        case 'month':
          return 'mo'
        case 'year':
          return 'yr'
        default:
          return intervalUnit
      }
    }

    return (
      <div className="flex items-center gap-3">
        <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            price.currency,
            price.unitPrice
          )}{' '}
          {price.type === PriceType.Subscription
            ? `/ ${getShortenedIntervalUnit(price.intervalUnit)}`
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
