import { IntervalUnit } from '@db-core/enums'
import { isLeapYear } from 'date-fns'
import { panic } from '@/errors'

interface GenerateNextBillingPeriodParams {
  billingCycleAnchorDate: Date | number
  interval: IntervalUnit
  intervalCount: number
  lastBillingPeriodEndDate?: Date | number | null
  trialEnd?: Date | number | null
  subscriptionStartDate?: Date | number
}

interface BillingPeriodRange {
  startDate: number
  endDate: number
}

function getDaysInMonth(year: number, month: number): number {
  // Returns how many days are in a given month (0-based),
  // e.g. getDaysInMonth(2023, 1) => 28 or 29 for February
  // Use UTC to avoid timezone issues
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * Generates the start and end dates for the next billing period.
 * If trialEnd is provided, the billing period will end on the trialEnd date
 * and use the billingAnchorDate as the start date.
 * @param param0
 * @returns
 */
export function generateNextBillingPeriod({
  billingCycleAnchorDate,
  interval,
  intervalCount,
  lastBillingPeriodEndDate,
  trialEnd,
  subscriptionStartDate,
}: GenerateNextBillingPeriodParams): BillingPeriodRange {
  const effectiveStartDate = new Date(
    subscriptionStartDate || billingCycleAnchorDate
  ).getTime()

  if (trialEnd) {
    if (new Date(trialEnd).getTime() <= effectiveStartDate) {
      panic(
        'Trial end date must be after the billing cycle anchor date.'
      )
    }
    return {
      startDate: effectiveStartDate,
      endDate: new Date(trialEnd).getTime(),
    }
  }

  // 1) Disallow zero or negative intervals
  if (intervalCount <= 0) {
    panic(
      `intervalCount must be a positive integer. Received: ${intervalCount}`
    )
  }

  // 2) Determine the startDate:
  //    - If lastBillingPeriodEndDate is provided, use it exactly (to allow contiguous)
  //    - Else use the anchor date
  const startDate = lastBillingPeriodEndDate
    ? new Date(lastBillingPeriodEndDate).getTime()
    : effectiveStartDate
  const startDateObj = new Date(startDate)

  let endDate: Date
  if (interval === IntervalUnit.Month) {
    // For monthly intervals, we need to handle month-end edge cases properly
    const startDay = startDateObj.getUTCDate()
    const startMonth = startDateObj.getUTCMonth()
    const startYear = new Date(startDate).getUTCFullYear()

    // Calculate the target month and year
    const totalMonths = startMonth + intervalCount
    const targetMonth = totalMonths % 12
    const targetYear = startYear + Math.floor(totalMonths / 12)

    // Get the number of days in the target month
    const daysInTargetMonth = getDaysInMonth(targetYear, targetMonth)

    // If the original day is greater than days in target month, clamp it
    // e.g., Jan 31 -> Feb 28/29, May 31 -> Jun 30
    const targetDay = Math.min(startDay, daysInTargetMonth)

    // Create the new endDate, preserving the time of day from the startDate
    endDate = new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        targetDay,
        startDateObj.getUTCHours(),
        startDateObj.getUTCMinutes(),
        startDateObj.getUTCSeconds(),
        startDateObj.getUTCMilliseconds()
      )
    )
  } else if (interval === IntervalUnit.Year) {
    // For yearly intervals, we need to handle leap year edge cases
    const startDay = startDateObj.getUTCDate()
    const startMonth = startDateObj.getUTCMonth()
    const startYear = startDateObj.getUTCFullYear()

    const targetYear = startYear + intervalCount

    // Special case: Feb 29 in leap year -> Feb 28 in non-leap year
    let targetDay = startDay
    if (
      startMonth === 1 &&
      startDay === 29 &&
      !isLeapYear(new Date(targetYear, 0, 1))
    ) {
      targetDay = 28
    }
    // Create the new endDate, preserving the time of day from the startDate
    endDate = new Date(
      Date.UTC(
        targetYear,
        startMonth,
        targetDay,
        startDateObj.getUTCHours(),
        startDateObj.getUTCMinutes(),
        startDateObj.getUTCSeconds(),
        startDateObj.getUTCMilliseconds()
      )
    )
  } else {
    // Currently only support Month & Year intervals
    panic(`Unsupported interval: ${interval}`)
  }

  // 3) Validate that new start isn't before lastEnd,
  //    and that end is after start
  if (lastBillingPeriodEndDate) {
    const startTime = startDateObj.getTime()
    const endTime = endDate.getTime()
    const lastEndTime = new Date(lastBillingPeriodEndDate).getTime()

    if (startTime < lastEndTime) {
      panic(
        'Next period start date must be after last period end date. ' +
          `Received start date: ${startDateObj.toISOString()} and ` +
          `last period end date: ${new Date(lastBillingPeriodEndDate).toISOString()}`
      )
    }

    if (endTime <= startTime) {
      panic('Period end date must be after start date')
    }
  }

  return {
    startDate: startDateObj.getTime(),
    endDate: endDate.getTime(),
  }
}
