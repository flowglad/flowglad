import { describe, expect, it } from 'bun:test'
import type { Flowglad } from '@flowglad/node'
import core from '@/utils/core'
import { SdkClientDep } from './sdkClientDependency'

describe('SdkClientDep', () => {
  it('production implementation creates a Flowglad client with correct baseUrl', () => {
    // setup: get the 'production' implementation
    const productionDep = SdkClientDep.get('production')

    // expect: createClient() returns a Flowglad instance
    const client = productionDep.createClient()
    expect(client).toBeInstanceOf(Object)
    // Verify it has the expected SDK methods
    expect(typeof client.customers).toBe('object')
    expect(typeof client.pricingModels).toBe('object')

    // expect: baseUrl matches NEXT_PUBLIC_APP_URL
    expect(productionDep.baseUrl).toBe(core.NEXT_PUBLIC_APP_URL)
    expect(productionDep.description).toBe('Production API')
  })
})
