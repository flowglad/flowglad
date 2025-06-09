import { IntervalUnit } from '@/types'
import { addMonths, addYears, isLeapYear } from 'date-fns'

interface GenerateNextBillingPeriodParams {
  billingCycleAnchorDate: Date
  interval: IntervalUnit
  intervalCount: number
  lastBillingPeriodEndDate?: Date | null
  trialEnd?: Date | null
}

interface BillingPeriodRange {
  startDate: Date
  endDate: Date
}

function getDaysInMonth(year: number, month: number): number {
  // Returns how many days are in a given month (0-based),
  // e.g. getDaysInMonth(2023, 1) => 28 or 29 for February
  return new Date(year, month + 1, 0).getDate()
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
}: GenerateNextBillingPeriodParams): BillingPeriodRange {
  // 1) Disallow zero or negative intervals
  if (intervalCount <= 0) {
    throw new Error(
      `intervalCount must be a positive integer. Received: ${intervalCount}`
    )
  }

  // 2) Determine the startDate:
  //    - If lastBillingPeriodEndDate is provided, use it exactly (to allow contiguous)
  //    - Else use the anchor date
  const startDate = lastBillingPeriodEndDate
    ? new Date(lastBillingPeriodEndDate.getTime())
    : billingCycleAnchorDate

  let endDate: Date
  if (interval === IntervalUnit.Month) {
    // For monthly intervals, figure out how many days we should use based on startDate's day
    const startDay = startDate.getUTCDate()

    // Add `intervalCount` months to startDate
    const workingDate = addMonths(startDate, intervalCount)
    const targetYear = workingDate.getUTCFullYear()
    const targetMonth = workingDate.getUTCMonth()
    const daysInTargetMonth = getDaysInMonth(targetYear, targetMonth)

    // If the original startDay is 31, but new month has only 30 days, clamp to 30, etc.
    const targetDay = Math.min(startDay, daysInTargetMonth)

    // Create the new endDate, preserving the time of day from the startDate
    endDate = new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        targetDay,
        startDate.getUTCHours(),
        startDate.getUTCMinutes(),
        startDate.getUTCSeconds(),
        startDate.getUTCMilliseconds()
      )
    )
  } else if (interval === IntervalUnit.Year) {
    // For yearly intervals, add `intervalCount` years to startDate
    const baseEndDate = addYears(startDate, intervalCount)

    // If the anchor day was Feb 29 but the new year isn't a leap year, clamp to Feb 28
    // However, we preserve the time from startDate
    if (
      billingCycleAnchorDate.getUTCMonth() === 1 && // 1 => February
      billingCycleAnchorDate.getUTCDate() === 29 && // was anchored on Feb 29
      !isLeapYear(baseEndDate) // new year isn't leap
    ) {
      endDate = new Date(
        Date.UTC(
          baseEndDate.getUTCFullYear(),
          1, // February
          28,
          startDate.getUTCHours(),
          startDate.getUTCMinutes(),
          startDate.getUTCSeconds(),
          startDate.getUTCMilliseconds()
        )
      )
    } else {
      // Otherwise, just preserve the date portion from adding years,
      // but also preserve the time portion from startDate
      endDate = new Date(
        Date.UTC(
          baseEndDate.getUTCFullYear(),
          baseEndDate.getUTCMonth(),
          baseEndDate.getUTCDate(),
          startDate.getUTCHours(),
          startDate.getUTCMinutes(),
          startDate.getUTCSeconds(),
          startDate.getUTCMilliseconds()
        )
      )
    }
  } else {
    // Currently only support Month & Year intervals
    throw new Error(`Unsupported interval: ${interval}`)
  }

  // 3) Validate that new start isn't before lastEnd,
  //    and that end is after start
  if (lastBillingPeriodEndDate) {
    const startTime = startDate.getTime()
    const endTime = endDate.getTime()
    const lastEndTime = lastBillingPeriodEndDate.getTime()

    if (startTime < lastEndTime) {
      throw new Error(
        'Next period start date must be after last period end date. ' +
          `Received start date: ${startDate.toISOString()} and ` +
          `last period end date: ${lastBillingPeriodEndDate.toISOString()}`
      )
    }

    if (endTime <= startTime) {
      throw new Error('Period end date must be after start date')
    }
  }

  return {
    startDate,
    endDate,
  }
}
