import { router } from '../trpc'
import { protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import mapBoxGeocoder from '@mapbox/mapbox-sdk/services/geocoding'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { customers as customersTable } from '@/db/schema/customers'
import {
  billingAddressSchema,
  type BillingAddress,
} from '@/db/schema/organizations'
import { and, eq, ilike, or, sql } from 'drizzle-orm'

const geocoder = mapBoxGeocoder({
  accessToken:
    'pk.eyJ1IjoiamFja2x5bmNoMDAiLCJhIjoiY21lMHBmZ3NmMDc4aTJtcHhmem9jeXh6aiJ9.lsVfht6Odmm0Ex1evYruSA',
})

export enum SubscriptionStatus {
  Active = 'active',
  Inactive = 'inactive',
  Trial = 'trial',
  Cancelled = 'cancelled',
}

export const geocodedCustomerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  billingAddress: billingAddressSchema.nullable(),
  coordinates: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable(),
  subscriptionStatus: z.nativeEnum(SubscriptionStatus).optional(),
})

const customerMapDataSchema = z.object({
  customers: z.array(geocodedCustomerSchema),
  total: z.number(),
})

async function geocodeAddress(
  address: BillingAddress | null
): Promise<{
  latitude: number
  longitude: number
} | null> {
  if (!address?.address?.city && !address?.address?.line1) {
    return null
  }

  try {
    const addressParts = [
      address.address?.line1,
      address.address?.city,
      address.address?.state,
      address.address?.country,
    ].filter(Boolean)

    if (addressParts.length === 0) return null

    const addressString = addressParts.join(', ')

    const response = await geocoder
      .forwardGeocode({
        query: addressString,
        limit: 1,
        types: ['place', 'locality', 'address'],
      })
      .send()

    const features = response.body.features

    if (features && features.length > 0) {
      const feature = features[0]
      const [longitude, latitude] = feature.center

      return {
        latitude,
        longitude,
      }
    }

    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

const getCustomerMapData = protectedProcedure
  .input(
    z.object({
      organizationId: z.string().optional(),
      limit: z.number().min(1).max(1000).default(1000),
      batchSize: z.number().min(1).max(20).default(10),
      search: z.string().optional(),
    })
  )
  .output(customerMapDataSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transaction, ctx }) => {
        const organizationId =
          input.organizationId || ctx.organizationId

        if (!organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }

        let customers = []
        if (input.search && input.search.trim()) {
          const searchTerm = `%${input.search.toLowerCase()}%`

          const billingAddressFields = [
            'line1',
            'line2',
            'city',
            'state',
            'postal_code',
            'country',
          ] as const

          const billingAddressConditions = billingAddressFields.map(
            (field) =>
              sql`${customersTable.billingAddress}->'address'->>${sql.raw(`'${field}'`)} ILIKE ${searchTerm}`
          )

          const allSearchConditions = [
            ilike(customersTable.name, searchTerm),
            ilike(customersTable.email, searchTerm),
            ...billingAddressConditions,
          ]

          customers = await transaction
            .select()
            .from(customersTable)
            .where(
              and(
                eq(customersTable.organizationId, organizationId),
                or(...allSearchConditions)
              )
            )
            .limit(input.limit)
        } else {
          customers = await selectCustomers(
            {
              organizationId,
            },
            transaction
          )
        }

        if (!customers.length) {
          return {
            customers: [],
            total: 0,
          }
        }

        const geocodedResults: Array<
          z.infer<typeof geocodedCustomerSchema>
        > = []

        try {
          for (
            let i = 0;
            i < customers.length;
            i += input.batchSize
          ) {
            const batch = customers.slice(i, i + input.batchSize)

            const batchPromises = batch.map(async (customer) => {
              try {
                const coordinates = await geocodeAddress(
                  customer.billingAddress as BillingAddress
                )

                return {
                  id: customer.id,
                  name: customer.name,
                  email: customer.email,
                  billingAddress: customer.billingAddress,
                  coordinates,
                  subscriptionStatus: SubscriptionStatus.Active,
                }
              } catch (error) {
                console.error(
                  `Error geocoding customer ${customer.id}:`,
                  error
                )
                return {
                  id: customer.id,
                  name: customer.name,
                  email: customer.email,
                  billingAddress: customer.billingAddress,
                  coordinates: null,
                  subscriptionStatus: SubscriptionStatus.Active,
                }
              }
            })

            const batchResults = await Promise.all(batchPromises)
            geocodedResults.push(
              ...batchResults.map((result) => ({
                ...result,
                billingAddress:
                  result.billingAddress as BillingAddress,
              }))
            )

            if (i + input.batchSize < customers.length) {
              await new Promise((resolve) => setTimeout(resolve, 50))
            }
          }
        } catch (error) {
          console.error('Error in geocoding process:', error)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to process customer geocoding',
            cause: error,
          })
        }

        const response = {
          customers: geocodedResults,
          total: geocodedResults.length,
        }

        return response
      }
    )
  )

const geocodeSingleAddress = protectedProcedure
  .input(billingAddressSchema)
  .output(
    z.object({
      coordinates: z
        .object({
          latitude: z.number(),
          longitude: z.number(),
        })
        .nullable(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }

    const billingAddress: BillingAddress = {
      address: input.address,
    }

    try {
      const coordinates = await geocodeAddress(billingAddress)
      return { coordinates }
    } catch (error) {
      console.error('Geocoding error:', error)
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to geocode address',
        cause: error,
      })
    }
  })

export const customerMapRouter = router({
  getMapData: getCustomerMapData,
  geocodeAddress: geocodeSingleAddress,
})
