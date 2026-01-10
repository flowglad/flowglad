import { describe, expect, it } from 'vitest'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import {
  buildFeeMetadata,
  reverseStripeTaxTransaction,
} from './stripe'

describe('buildFeeMetadata', () => {
  /**
   * buildFeeMetadata only accesses these specific fields from FeeCalculation.Record:
   * - flowgladFeePercentage
   * - morSurchargePercentage
   * - internationalFeePercentage
   * - taxAmountFixed
   * - stripeTaxCalculationId
   *
   * We create a minimal mock with just these fields.
   */
  const baseFeeCalculation = {
    flowgladFeePercentage: '2.9',
    morSurchargePercentage: '1.1',
    internationalFeePercentage: '1.5',
    taxAmountFixed: 850,
    stripeTaxCalculationId: 'taxcalc_abc123',
  } as unknown as FeeCalculation.Record

  it('returns an empty object when feeCalculation is undefined', () => {
    const result = buildFeeMetadata(undefined)

    expect(result).toEqual({})
  })

  it('returns fee breakdown with all fields populated for a complete fee calculation', () => {
    const result = buildFeeMetadata(baseFeeCalculation)

    expect(result).toEqual({
      flowglad_fee_percentage: '2.9',
      mor_surcharge_percentage: '1.1',
      international_fee_percentage: '1.5',
      tax_amount: '850',
      stripe_tax_calculation_id: 'taxcalc_abc123',
    })
  })

  it('returns undefined for stripe_tax_calculation_id when it is null in the fee calculation', () => {
    const feeCalculation = {
      ...baseFeeCalculation,
      stripeTaxCalculationId: null,
    } as unknown as FeeCalculation.Record

    const result = buildFeeMetadata(feeCalculation)

    expect(result).toEqual({
      flowglad_fee_percentage: '2.9',
      mor_surcharge_percentage: '1.1',
      international_fee_percentage: '1.5',
      tax_amount: '850',
      stripe_tax_calculation_id: undefined,
    })
  })

  it('returns zero values as strings for Platform orgs without MoR surcharge or tax', () => {
    const platformFeeCalculation = {
      ...baseFeeCalculation,
      morSurchargePercentage: '0',
      taxAmountFixed: 0,
      internationalFeePercentage: '0',
      stripeTaxCalculationId: null,
    } as unknown as FeeCalculation.Record

    const result = buildFeeMetadata(platformFeeCalculation)

    expect(result).toEqual({
      flowglad_fee_percentage: '2.9',
      mor_surcharge_percentage: '0',
      international_fee_percentage: '0',
      tax_amount: '0',
      stripe_tax_calculation_id: undefined,
    })
  })

  it('converts taxAmountFixed integer to string representation', () => {
    const feeCalculation = {
      ...baseFeeCalculation,
      taxAmountFixed: 12345,
    } as unknown as FeeCalculation.Record

    const result = buildFeeMetadata(feeCalculation)

    expect(result.tax_amount).toBe('12345')
    expect(typeof result.tax_amount).toBe('string')
  })

  it('handles notaxoverride_ calculation IDs for zero-tax scenarios', () => {
    const feeCalculation = {
      ...baseFeeCalculation,
      taxAmountFixed: 0,
      stripeTaxCalculationId: 'notaxoverride_xyz789',
    } as unknown as FeeCalculation.Record

    const result = buildFeeMetadata(feeCalculation)

    expect(result.stripe_tax_calculation_id).toBe(
      'notaxoverride_xyz789'
    )
    expect(result.tax_amount).toBe('0')
  })
})

describe('reverseStripeTaxTransaction', () => {
  it('returns null for test tax transaction IDs (testtaxcalc_ prefix)', async () => {
    const result = await reverseStripeTaxTransaction({
      stripeTaxTransactionId: 'testtaxcalc_abc123',
      reference: 'refund_test_123',
      livemode: false,
      mode: 'full',
    })

    expect(result).toBeNull()
  })

  it('returns null for notaxoverride_ IDs', async () => {
    const result = await reverseStripeTaxTransaction({
      stripeTaxTransactionId: 'notaxoverride_xyz789',
      reference: 'refund_test_456',
      livemode: false,
      mode: 'full',
    })

    expect(result).toBeNull()
  })

  it('returns null for empty stripeTaxTransactionId', async () => {
    const result = await reverseStripeTaxTransaction({
      stripeTaxTransactionId: '',
      reference: 'refund_test_789',
      livemode: false,
      mode: 'full',
    })

    expect(result).toBeNull()
  })
})
