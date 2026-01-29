import { PriceType } from '@db-core/enums'
import type { Price } from '@/db/schema/prices'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const PricingCellView = ({
  prices,
}: {
  prices: Price.ClientRecord[]
}) => {
  if (prices.length === 0) {
    return <div>-</div>
  }

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

  // Find the default active price for display, or fall back to the first price
  const price =
    prices.find((p) => p.isDefault && p.active) || prices[0]

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

export default PricingCellView
