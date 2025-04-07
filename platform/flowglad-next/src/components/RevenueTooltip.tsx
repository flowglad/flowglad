import { TooltipCallbackProps } from '@/components/charts/AreaChart'
import { twMerge } from 'tailwind-merge'
import clsx from 'clsx'
import core from '@/utils/core'
import { getColorClassName } from '@/utils/chartStyles'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { useAuthenticatedContext } from '@/contexts/authContext'

export const RevenueTooltip = ({
  active,
  payload,
  label,
}: TooltipCallbackProps) => {
  const { organization } = useAuthenticatedContext()
  if (!active || !payload?.[0] || !organization) {
    return null
  }
  const value = payload[0].value as number
  const formattedValue =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      organization.defaultCurrency,
      value
    )

  return (
    <div
      className={twMerge(
        clsx(
          'bg-[#282828] flex flex-col gap-2 p-4 rounded-radius-sm border border-stroke-subtle shadow-[3px_4px_17px_0_rgba(1.35,5.12,17,0.2)]'
        )
      )}
    >
      <div className="flex justify-between items-center gap-2 text-xs font-medium text-on-primary-hover">
        <div className="text-left">
          <div
            className={core.cn(
              getColorClassName(payload[0].color, 'bg'),
              'w-2 h-2 rounded-full'
            )}
            style={{ width: '10px', height: '10px' }}
          />
        </div>
        <div>{core.formatDate(new Date(label))}</div>
        <div className="text-right">{formattedValue}</div>
      </div>
    </div>
  )
}
