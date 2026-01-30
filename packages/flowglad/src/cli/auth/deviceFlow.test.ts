import { describe, it } from 'vitest'

describe('requestDeviceCode', () => {
  it.skip('returns device code and verification URI', () => {
    // PENDING: Patch 4
  })
})

describe('pollForToken', () => {
  it.skip('returns refresh token after user authorizes', () => {
    // PENDING: Patch 4
  })

  it.skip('handles authorization_pending response', () => {
    // PENDING: Patch 4
  })

  it.skip('throws on expired_token response', () => {
    // PENDING: Patch 4
  })

  it.skip('handles slow_down response by increasing interval', () => {
    // PENDING: Patch 4
  })

  it.skip('throws on access_denied response', () => {
    // PENDING: Patch 4
  })
})
