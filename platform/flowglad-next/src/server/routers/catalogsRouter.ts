import { protectedProcedure, router } from '@/server/trpc'
import {
  catalogsClientSelectSchema,
  catalogsPaginatedListSchema,
  catalogsPaginatedSelectSchema,
  catalogIdSchema,
  createCatalogSchema,
  editCatalogSchema,
} from '@/db/schema/catalogs'
import { catalogWithProductsSchema } from '@/db/schema/products'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  insertCatalog,
  selectCatalogsPaginated,
  updateCatalog,
  makeCatalogDefault,
  selectCatalogsWithProductsByCatalogWhere,
} from '@/db/tableMethods/catalogMethods'
import { generateOpenApiMetas } from '@/utils/openapi'
import { z } from 'zod'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Catalog',
  tags: ['Catalogs'],
})

export const catalogsRouteConfigs = routeConfigs

const listCatalogsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(catalogsPaginatedSelectSchema)
  .output(catalogsPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectCatalogsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getCatalogProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(catalogIdSchema)
  .output(catalogWithProductsSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const [catalog] =
          await selectCatalogsWithProductsByCatalogWhere(
            { id: input.id },
            transaction
          )
        if (!catalog) {
          throw new Error(`Catalog ${input.id} not found`)
        }
        return catalog
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const createCatalogProcedure = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createCatalogSchema)
  .output(
    z.object({
      catalog: catalogsClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertCatalog(
          {
            ...input.catalog,
            livemode: ctx.livemode,
            organizationId: ctx.organizationId!,
          },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { catalog }
  })

const editCatalogProcedure = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editCatalogSchema)
  .output(
    z.object({
      data: z.object({
        catalog: catalogsClientSelectSchema,
      }),
    })
  )
  .mutation(async ({ input }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        const catalog = await updateCatalog(
          input.catalog,
          transaction
        )
        if (catalog.isDefault) {
          return makeCatalogDefault(catalog, transaction)
        }
        return catalog
      }
    )
    return {
      data: { catalog },
    }
  })

const getDefaultCatalogProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .output(catalogWithProductsSchema)
  .query(async ({ ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const result = await selectCatalogsWithProductsByCatalogWhere(
        {
          organizationId: ctx.organizationId!,
          livemode: ctx.livemode,
          isDefault: true,
        },
        transaction
      )
      return result[0]
    })
  })
export const catalogsRouter = router({
  list: listCatalogsProcedure,
  get: getCatalogProcedure,
  getDefault: getDefaultCatalogProcedure,
  create: createCatalogProcedure,
  update: editCatalogProcedure,
})
