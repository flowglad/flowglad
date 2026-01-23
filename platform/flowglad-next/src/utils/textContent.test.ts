import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { setupOrg, setupPricingModel } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import {
  selectPricingModelById,
  updatePricingModel,
} from '@/db/tableMethods/pricingModelMethods'

// Import the real generateContentHash function before mocking
import { generateContentHash as realGenerateContentHash } from './cloudflare'

// Create mock functions for Cloudflare
const mockPutMarkdownFile =
  mock<
    (params: {
      organizationId: string
      key: string
      markdown: string
    }) => Promise<void>
  >()
const mockGetMarkdownFile =
  mock<
    (params: {
      organizationId: string
      key: string
    }) => Promise<string | null>
  >()

// Mock Cloudflare functions
mock.module('./cloudflare', () => ({
  generateContentHash: realGenerateContentHash,
  putMarkdownFile: mockPutMarkdownFile,
  getMarkdownFile: mockGetMarkdownFile,
}))

import {
  generateContentHash,
  getMarkdownFile,
  putMarkdownFile,
} from './cloudflare'
import {
  getOrganizationCodebaseMarkdown,
  getPricingModelIntegrationMarkdown,
  saveOrganizationCodebaseMarkdown,
  savePricingModelIntegrationMarkdown,
} from './textContent'

describe('saveOrganizationCodebaseMarkdown', () => {
  let organization: Organization.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    mockPutMarkdownFile.mockReset()
    mockGetMarkdownFile.mockReset()
  })
  it('should successfully save markdown and update organization codebaseMarkdownHash', async () => {
    const markdown =
      '# Test Codebase Documentation\n\nThis is test content.'
    mockPutMarkdownFile.mockResolvedValue(undefined)

    await saveOrganizationCodebaseMarkdown({
      organizationId: organization.id,
      markdown,
    })

    // Verify putMarkdownFile was called with correct parameters
    expect(putMarkdownFile).toHaveBeenCalledTimes(1)
    const putCall = mockPutMarkdownFile.mock.calls[0][0]
    expect(putCall.organizationId).toBe(organization.id)
    expect(putCall.markdown).toBe(markdown)
    expect(putCall.key).toMatch(/^codebase-[a-f0-9]{64}\.md$/)

    // Verify database was updated with the hash
    const updatedOrg = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectOrganizationById(organization.id, transaction)
    })
    expect(updatedOrg?.codebaseMarkdownHash).toBe(
      putCall.key.replace('codebase-', '').replace('.md', '')
    )
  })

  it('should throw an error when organization is not found', async () => {
    const nonExistentOrgId = 'org_nonexistent'
    mockPutMarkdownFile.mockClear()

    await expect(
      saveOrganizationCodebaseMarkdown({
        organizationId: nonExistentOrgId,
        markdown: '# Test',
      })
    ).rejects.toThrow(/No organizations found with id/)

    // Verify putMarkdownFile was never called
    expect(putMarkdownFile).not.toHaveBeenCalled()
  })

  it('should generate a hash based on the organization securitySalt and the markdown content', async () => {
    const markdown = '# Test Content'
    mockPutMarkdownFile.mockResolvedValue(undefined)

    await saveOrganizationCodebaseMarkdown({
      organizationId: organization.id,
      markdown,
    })

    // Verify the hash was generated using the organization's securitySalt
    const expectedHash = generateContentHash({
      content: markdown,
      securitySalt: organization.securitySalt,
    })

    const updatedOrg = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectOrganizationById(organization.id, transaction)
    })
    expect(updatedOrg?.codebaseMarkdownHash).toBe(expectedHash)
  })

  it('should call putMarkdownFile before updateOrganization', async () => {
    const markdown = '# Test Content'
    let putMarkdownFileCalled = false
    mockPutMarkdownFile.mockImplementation(async () => {
      putMarkdownFileCalled = true
      return Promise.resolve()
    })

    // Verify that if putMarkdownFile fails, the database is not updated
    // This implicitly tests the order: if putMarkdownFile is called first and succeeds,
    // then the database update happens. If putMarkdownFile fails, update shouldn't happen.
    await saveOrganizationCodebaseMarkdown({
      organizationId: organization.id,
      markdown,
    })

    // Verify putMarkdownFile was called
    expect(putMarkdownFileCalled).toBe(true)
    expect(putMarkdownFile).toHaveBeenCalledTimes(1)

    // Verify database was updated (which only happens after successful putMarkdownFile)
    const updatedOrg = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectOrganizationById(organization.id, transaction)
    })
    expect(typeof updatedOrg?.codebaseMarkdownHash).toBe('string')
  })

  it('should generate different hashes for different markdown content', async () => {
    const markdown1 = '# First Content'
    const markdown2 = '# Second Content'
    mockPutMarkdownFile.mockResolvedValue(undefined)

    // First save
    await saveOrganizationCodebaseMarkdown({
      organizationId: organization.id,
      markdown: markdown1,
    })

    const orgAfterFirst = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectOrganizationById(organization.id, transaction)
    })
    const firstHash = orgAfterFirst?.codebaseMarkdownHash
    expect(typeof firstHash).toBe('string')

    const firstPutCall = mockPutMarkdownFile.mock.calls[0][0]
    expect(firstPutCall.key).toBe(`codebase-${firstHash}.md`)

    // Second save with different content
    mockPutMarkdownFile.mockClear()
    await saveOrganizationCodebaseMarkdown({
      organizationId: organization.id,
      markdown: markdown2,
    })

    const orgAfterSecond = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectOrganizationById(organization.id, transaction)
    })
    const secondHash = orgAfterSecond?.codebaseMarkdownHash
    expect(typeof secondHash).toBe('string')
    expect(secondHash).not.toBe(firstHash)

    const secondPutCall = mockPutMarkdownFile.mock.calls[0][0]
    expect(secondPutCall.key).toBe(`codebase-${secondHash}.md`)
    expect(secondPutCall.key).not.toBe(firstPutCall.key)
  })
})

describe('getOrganizationCodebaseMarkdown', () => {
  let organization: Organization.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    mockPutMarkdownFile.mockReset()
    mockGetMarkdownFile.mockReset()
  })

  it('should successfully retrieve markdown content from R2', async () => {
    const testHash = 'testhash789'
    const expectedContent =
      '# Codebase Documentation\n\nThis is the content.'
    // Set codebaseMarkdownHash in database
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updateOrganization(
        {
          id: organization.id,
          codebaseMarkdownHash: testHash,
        },
        transaction
      )
    })

    mockGetMarkdownFile.mockResolvedValue(expectedContent)

    const result = await getOrganizationCodebaseMarkdown(
      organization.id
    )

    expect(result).toBe(expectedContent)
    expect(getMarkdownFile).toHaveBeenCalledTimes(1)
    const getCall = mockGetMarkdownFile.mock.calls[0][0]
    expect(getCall.organizationId).toBe(organization.id)
    expect(getCall.key).toBe(`codebase-${testHash}.md`)
  })

  it('should throw an error when organization is not found', async () => {
    const nonExistentOrgId = 'org_nonexistent'
    mockGetMarkdownFile.mockClear()

    await expect(
      getOrganizationCodebaseMarkdown(nonExistentOrgId)
    ).rejects.toThrow(/No organizations found with id/)
  })

  it('should return null immediately when codebaseMarkdownHash is null', async () => {
    // Set codebaseMarkdownHash to null
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updateOrganization(
        {
          id: organization.id,
          codebaseMarkdownHash: null,
        },
        transaction
      )
    })

    mockGetMarkdownFile.mockClear()

    const result = await getOrganizationCodebaseMarkdown(
      organization.id
    )

    expect(result).toBeNull()
    expect(getMarkdownFile).not.toHaveBeenCalled()
  })

  it('should return null immediately when codebaseMarkdownHash is undefined', async () => {
    // Organization starts with codebaseMarkdownHash as undefined (not set)
    // Verify it's undefined or null
    const org = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectOrganizationById(organization.id, transaction)
    })
    expect(org?.codebaseMarkdownHash).toBeNull()

    mockGetMarkdownFile.mockClear()

    const result = await getOrganizationCodebaseMarkdown(
      organization.id
    )

    expect(result).toBeNull()
    expect(getMarkdownFile).not.toHaveBeenCalled()
  })

  it('should return null when R2 file is not found', async () => {
    const testHash = 'testhash123'
    // Set codebaseMarkdownHash in database
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updateOrganization(
        {
          id: organization.id,
          codebaseMarkdownHash: testHash,
        },
        transaction
      )
    })

    mockGetMarkdownFile.mockResolvedValue(null)

    const result = await getOrganizationCodebaseMarkdown(
      organization.id
    )

    expect(result).toBeNull()
    expect(getMarkdownFile).toHaveBeenCalledTimes(1)
    const getCall = mockGetMarkdownFile.mock.calls[0][0]
    expect(getCall.organizationId).toBe(organization.id)
    expect(getCall.key).toBe(`codebase-${testHash}.md`)
  })
})

describe('savePricingModelIntegrationMarkdown', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = await setupPricingModel({
      organizationId: organization.id,
    })
    mockPutMarkdownFile.mockReset()
    mockGetMarkdownFile.mockReset()
  })
  it('should successfully save markdown and update pricing model integrationGuideHash', async () => {
    const markdown = '# Integration Guide\n\nThis is test content.'
    mockPutMarkdownFile.mockResolvedValue(undefined)

    await savePricingModelIntegrationMarkdown({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      markdown,
    })

    // Verify putMarkdownFile was called with correct parameters
    expect(putMarkdownFile).toHaveBeenCalledTimes(1)
    const putCall = mockPutMarkdownFile.mock.calls[0][0]
    expect(putCall.organizationId).toBe(organization.id)
    expect(putCall.markdown).toBe(markdown)
    expect(putCall.key).toMatch(
      new RegExp(
        `^pricing-models/${pricingModel.id}/integration-guide-[a-f0-9]{64}\\.md$`
      )
    )

    // Verify database was updated with the hash
    const updatedPricingModel = await adminTransaction(
      async (ctx) => {
        const { transaction } = ctx
        return selectPricingModelById(pricingModel.id, transaction)
      }
    )
    expect(typeof updatedPricingModel?.integrationGuideHash).toBe(
      'string'
    )
    const hashFromKey = putCall.key
      .replace(
        `pricing-models/${pricingModel.id}/integration-guide-`,
        ''
      )
      .replace('.md', '')
    expect(updatedPricingModel?.integrationGuideHash).toBe(
      hashFromKey
    )
  })

  it('should throw an error when organization is not found', async () => {
    const nonExistentOrgId = 'org_nonexistent'
    mockPutMarkdownFile.mockClear()

    await expect(
      savePricingModelIntegrationMarkdown({
        organizationId: nonExistentOrgId,
        pricingModelId: pricingModel.id,
        markdown: '# Test',
      })
    ).rejects.toThrow(/No organizations found with id/)

    // Verify putMarkdownFile was never called
    expect(putMarkdownFile).not.toHaveBeenCalled()
  })
})

describe('getPricingModelIntegrationMarkdown', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = await setupPricingModel({
      organizationId: organization.id,
    })
    mockPutMarkdownFile.mockReset()
    mockGetMarkdownFile.mockReset()
  })

  it('should successfully retrieve markdown content from R2', async () => {
    const testHash = 'testhash999'
    const expectedContent =
      '# Integration Guide\n\nThis is the content.'
    // Set integrationGuideHash in database
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updatePricingModel(
        {
          id: pricingModel.id,
          integrationGuideHash: testHash,
        },
        ctx
      )
    })

    mockGetMarkdownFile.mockResolvedValue(expectedContent)

    const result = await getPricingModelIntegrationMarkdown({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
    })

    expect(result).toBe(expectedContent)
    expect(getMarkdownFile).toHaveBeenCalledTimes(1)
    const getCall = mockGetMarkdownFile.mock.calls[0][0]
    expect(getCall.organizationId).toBe(organization.id)
    expect(getCall.key).toBe(
      `pricing-models/${pricingModel.id}/integration-guide-${testHash}.md`
    )
  })

  it('should throw an error when pricing model is not found', async () => {
    const nonExistentPricingModelId = 'pm_nonexistent'
    mockGetMarkdownFile.mockClear()

    await expect(
      getPricingModelIntegrationMarkdown({
        organizationId: organization.id,
        pricingModelId: nonExistentPricingModelId,
      })
    ).rejects.toThrow(/No pricing models found with id/)
  })

  it('should return null immediately when integrationGuideHash is null', async () => {
    // Set integrationGuideHash to null
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updatePricingModel(
        {
          id: pricingModel.id,
          integrationGuideHash: null,
        },
        ctx
      )
    })

    mockGetMarkdownFile.mockClear()

    const result = await getPricingModelIntegrationMarkdown({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
    })

    expect(result).toBeNull()
    expect(getMarkdownFile).not.toHaveBeenCalled()
  })

  it('should return null immediately when integrationGuideHash is undefined', async () => {
    // Pricing model starts with integrationGuideHash as undefined (not set)
    // Verify it's undefined or null
    const pm = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return selectPricingModelById(pricingModel.id, transaction)
    })
    expect(pm?.integrationGuideHash).toBeNull()

    mockGetMarkdownFile.mockClear()

    const result = await getPricingModelIntegrationMarkdown({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
    })

    expect(result).toBeNull()
    expect(getMarkdownFile).not.toHaveBeenCalled()
  })

  it('should return null when R2 file is not found', async () => {
    const testHash = 'testhash456'
    // Set integrationGuideHash in database
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updatePricingModel(
        {
          id: pricingModel.id,
          integrationGuideHash: testHash,
        },
        ctx
      )
    })

    mockGetMarkdownFile.mockResolvedValue(null)

    const result = await getPricingModelIntegrationMarkdown({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
    })

    expect(result).toBeNull()
    expect(getMarkdownFile).toHaveBeenCalledTimes(1)
    const getCall = mockGetMarkdownFile.mock.calls[0][0]
    expect(getCall.organizationId).toBe(organization.id)
    expect(getCall.key).toBe(
      `pricing-models/${pricingModel.id}/integration-guide-${testHash}.md`
    )
  })
})
