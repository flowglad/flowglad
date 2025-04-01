import { protectedProcedure, router } from '@/server/trpc'
import {
  catalogsClientSelectSchema,
  catalogsPaginatedListSchema,
  catalogsPaginatedSelectSchema,
  catalogIdSchema,
  createCatalogSchema,
  editCatalogSchema,
  cloneCatalogInputSchema,
} from '@/db/schema/catalogs'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  insertCatalog,
  selectCatalogsPaginated,
  updateCatalog,
  makeCatalogDefault,
  selectCatalogsWithProductsAndUsageMetersByCatalogWhere,
  selectDefaultCatalog,
} from '@/db/tableMethods/catalogMethods'
import {
  createGetOpenApiMeta,
  createPostOpenApiMeta,
  generateOpenApiMetas,
} from '@/utils/openapi'
import { z } from 'zod'
import { cloneCatalogTransaction } from '@/utils/catalog'
import { selectPricesAndProductsByProductWhere } from '@/db/tableMethods/priceMethods'
import { catalogWithProductsAndUsageMetersSchema } from '@/db/schema/prices'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'catalog',
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
  .output(catalogWithProductsAndUsageMetersSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const [catalog] =
          await selectCatalogsWithProductsAndUsageMetersByCatalogWhere(
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
      catalog: catalogsClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        const catalog = await updateCatalog(
          {
            ...input.catalog,
            id: input.id,
          },
          transaction
        )
        if (catalog.isDefault) {
          return makeCatalogDefault(catalog, transaction)
        }
        return catalog
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return {
      catalog,
    }
  })

const getDefaultCatalogProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'GET',
      path: '/api/v1/catalogs/default',
      summary: 'Get Default Catalog for Organization',
      tags: ['Catalogs'],
      protect: true,
    },
  })
  .input(z.object({}))
  .output(catalogWithProductsAndUsageMetersSchema)
  .query(async ({ ctx }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        const defaultCatalog = await selectDefaultCatalog(
          {
            organizationId: ctx.organizationId!,
            livemode: ctx.livemode,
          },
          transaction
        )
        if (!defaultCatalog) {
          throw new Error('Default catalog not found')
        }
        const products = await selectPricesAndProductsByProductWhere(
          { catalogId: defaultCatalog.id },
          transaction
        )
        return {
          ...defaultCatalog,
          products,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    return catalog
  })

const cloneCatalogProcedure = protectedProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/api/v1/catalogs/{id}/clone',
      summary: 'Clone a Catalog',
      tags: ['Catalogs'],
      protect: true,
    },
  })
  .input(cloneCatalogInputSchema)
  .output(
    z.object({ catalog: catalogWithProductsAndUsageMetersSchema })
  )
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const catalog = await cloneCatalogTransaction(
          input,
          transaction
        )
        return { catalog }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const catalogsRouter = router({
  list: listCatalogsProcedure,
  get: getCatalogProcedure,
  getDefault: getDefaultCatalogProcedure,
  create: createCatalogProcedure,
  update: editCatalogProcedure,
  clone: cloneCatalogProcedure,
})
