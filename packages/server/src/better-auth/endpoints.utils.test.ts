import { describe, expect, it } from 'vitest'
import {
  createGetCustomerDetails,
  getCreatorRoleFromOrgOptions,
  getOrgOptionsFromCtxContext,
  getStringProp,
  isAdapterLike,
  isRecord,
} from './endpoints'
import type { BetterAuthSessionResult } from './types'

describe('endpoints.ts utilities', () => {
  describe('isRecord', () => {
    it('returns false for non-objects, null, and arrays', () => {
      expect(isRecord(null)).toBe(false)
      expect(isRecord(undefined)).toBe(false)
      expect(isRecord('x')).toBe(false)
      expect(isRecord(1)).toBe(false)
      expect(isRecord(true)).toBe(false)
      expect(isRecord([])).toBe(false)
    })

    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true)
      expect(isRecord({ a: 1 })).toBe(true)
    })
  })

  describe('getStringProp', () => {
    it('returns the string when record[key] is a string', () => {
      expect(getStringProp({ a: 'x' }, 'a')).toBe('x')
      expect(getStringProp({ a: '' }, 'a')).toBe('')
    })

    it('returns null when record[key] is missing or not a string', () => {
      expect(getStringProp({}, 'missing')).toBe(null)
      expect(getStringProp({ a: 1 }, 'a')).toBe(null)
      expect(getStringProp({ a: null }, 'a')).toBe(null)
      expect(getStringProp({ a: {} }, 'a')).toBe(null)
      expect(getStringProp({ a: [] }, 'a')).toBe(null)
    })
  })

  describe('isAdapterLike', () => {
    it('returns false when value is not a record', () => {
      expect(isAdapterLike(null)).toBe(false)
      expect(isAdapterLike([])).toBe(false)
      expect(isAdapterLike('x')).toBe(false)
    })

    it('returns false when findOne/findMany are missing or not functions', () => {
      expect(isAdapterLike({ findOne: () => null })).toBe(false)
      expect(isAdapterLike({ findMany: () => [] })).toBe(false)
      expect(
        isAdapterLike({ findOne: 'nope', findMany: () => [] })
      ).toBe(false)
      expect(
        isAdapterLike({ findOne: () => null, findMany: 'nope' })
      ).toBe(false)
    })

    it('returns true when both findOne and findMany exist and are functions', () => {
      expect(
        isAdapterLike({
          findOne: async () => null,
          findMany: async () => [],
        })
      ).toBe(true)
    })
  })

  describe('getOrgOptionsFromCtxContext', () => {
    it('returns undefined when ctxContext is not a record or has invalid orgOptions', () => {
      expect(getOrgOptionsFromCtxContext(null)).toBe(undefined)
      expect(getOrgOptionsFromCtxContext([])).toBe(undefined)
      expect(getOrgOptionsFromCtxContext({})).toBe(undefined)
      expect(getOrgOptionsFromCtxContext({ orgOptions: null })).toBe(
        undefined
      )
      expect(getOrgOptionsFromCtxContext({ orgOptions: [] })).toBe(
        undefined
      )
    })

    it('returns orgOptions when present and a record', () => {
      const orgOptions = { creatorRole: 'owner' }
      expect(getOrgOptionsFromCtxContext({ orgOptions })).toEqual(
        orgOptions
      )
    })
  })

  describe('getCreatorRoleFromOrgOptions', () => {
    it('returns undefined when orgOptions is undefined or creatorRole is not a string', () => {
      expect(getCreatorRoleFromOrgOptions(undefined)).toBe(undefined)
      expect(getCreatorRoleFromOrgOptions({ creatorRole: 123 })).toBe(
        undefined
      )
    })

    it('returns creatorRole when it is a string', () => {
      expect(
        getCreatorRoleFromOrgOptions({ creatorRole: 'admin' })
      ).toBe('admin')
    })
  })

  describe('createGetCustomerDetails', () => {
    const baseSession: BetterAuthSessionResult = {
      session: { id: 's1', userId: 'u1' },
      user: { id: 'u1', name: null, email: null },
    }

    it('uses options.getCustomer when provided (and passes organizationId in innerSession when org mode)', async () => {
      const received: unknown[] = []
      const getCustomer = async (session: {
        user: {
          id: string
          name?: string | null
          email?: string | null
          organizationId?: string | null
        }
      }) => {
        received.push(session)
        return {
          externalId: 'ignored-by-createGetCustomerDetails',
          name: 'Custom Name',
          email: 'custom@example.com',
        }
      }

      const getCustomerDetails = createGetCustomerDetails({
        options: { customerType: 'organization', getCustomer },
        session: {
          ...baseSession,
          session: {
            ...baseSession.session,
            activeOrganizationId: 'org-1',
          },
        },
        ctxContext: {},
        adapter: null,
      })

      await expect(getCustomerDetails()).resolves.toEqual({
        name: 'Custom Name',
        email: 'custom@example.com',
      })

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({
        user: {
          id: 'u1',
          name: '',
          email: '',
          organizationId: 'org-1',
        },
      })
    })

    it('in organization mode, returns org name/email when active org is present and adapter is adapter-like', async () => {
      type Row = Record<string, string>

      class InMemoryAdapter {
        private readonly data: Record<string, Row[]>

        public constructor(data: Record<string, Row[]>) {
          this.data = data
        }

        public findOne = async (args: {
          model: string
          where: { field: string; value: string }[]
        }): Promise<unknown> => {
          const rows = this.data[args.model] ?? []
          const found =
            rows.find((row) =>
              args.where.every(
                (clause) => row[clause.field] === clause.value
              )
            ) ?? null
          return found
        }

        public findMany = async (args: {
          model: string
          where: { field: string; value: string }[]
        }): Promise<unknown> => {
          const rows = this.data[args.model] ?? []
          return rows.filter((row) =>
            args.where.every(
              (clause) => row[clause.field] === clause.value
            )
          )
        }
      }

      const adapter = new InMemoryAdapter({
        organization: [{ id: 'org-1', name: 'Acme', slug: 'acme' }],
        member: [
          {
            userId: 'u1',
            organizationId: 'org-1',
            role: 'member',
          },
          {
            userId: 'u-owner',
            organizationId: 'org-1',
            role: 'owner',
          },
        ],
        user: [{ id: 'u-owner', email: 'owner@acme.com' }],
      })

      const getCustomerDetails = createGetCustomerDetails({
        options: { customerType: 'organization' },
        session: {
          session: {
            id: 's1',
            userId: 'u1',
            activeOrganizationId: 'org-1',
          },
          user: {
            id: 'u1',
            name: 'Member',
            email: 'member@acme.com',
          },
        },
        ctxContext: { orgOptions: { creatorRole: 'owner' } },
        adapter,
      })

      await expect(getCustomerDetails()).resolves.toEqual({
        name: 'Acme',
        email: 'owner@acme.com',
      })
    })

    it('falls back to session user name/email when org mode is configured but active org is missing', async () => {
      const getCustomerDetails = createGetCustomerDetails({
        options: { customerType: 'organization' },
        session: {
          ...baseSession,
          user: { id: 'u1', name: 'User Name', email: 'u@x.com' },
        },
        ctxContext: {},
        adapter: null,
      })

      await expect(getCustomerDetails()).resolves.toEqual({
        name: 'User Name',
        email: 'u@x.com',
      })
    })

    it('falls back to session user when adapter is not adapter-like', async () => {
      const getCustomerDetails = createGetCustomerDetails({
        options: { customerType: 'organization' },
        session: {
          session: {
            id: 's1',
            userId: 'u1',
            activeOrganizationId: 'org-1',
          },
          user: { id: 'u1', name: 'User Name', email: 'u@x.com' },
        },
        ctxContext: { orgOptions: { creatorRole: 'owner' } },
        adapter: {},
      })

      await expect(getCustomerDetails()).resolves.toEqual({
        name: 'User Name',
        email: 'u@x.com',
      })
    })

    it('formats null/undefined user name/email as empty strings in fallback', async () => {
      const getCustomerDetails = createGetCustomerDetails({
        options: {},
        session: baseSession,
        ctxContext: {},
        adapter: null,
      })

      await expect(getCustomerDetails()).resolves.toEqual({
        name: '',
        email: '',
      })
    })
  })
})
