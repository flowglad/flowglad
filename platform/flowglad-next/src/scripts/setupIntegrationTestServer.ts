import {
  setupApiKey,
  setupMemberships,
  setupOrg,
} from '../../seedDatabase'

const setupIntegrationTestServer = async () => {
  const { organization, product, price, catalog } = await setupOrg({
    livemode: false,
  })
  const apiKey = await setupApiKey({
    organizationId: organization.id,
    name: 'testmode-key',
    livemode: false,
  })
  await setupMemberships({ organizationId: organization.id })
  // Set the API key token as FLOWGLAD_SECRET_KEY in GitHub Actions environment
  if (process.env.GITHUB_ENV) {
    const fs = require('fs')
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `FLOWGLAD_SECRET_KEY=${apiKey.token}\n`
    )
  }

  // eslint-disable-next-line no-console
  console.log('Test server setup complete:', {
    organizationId: organization.id,
    productId: product.id,
    priceId: price.id,
    catalogId: catalog.id,
    apiKey: apiKey.token,
  })
}

setupIntegrationTestServer()
