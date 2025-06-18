import { catalogsClientInsertSchema } from '@/db/schema/catalogs'
import { createProductSchema } from '@/db/schema/prices'
import { productsClientInsertSchema } from '@/db/schema/products'
import { usageMetersClientInsertSchema } from '@/db/schema/usageMeters'
import { z } from 'zod'

export const featureCatalogSetupSchema = z.object({})

export const setupCatalogSchema = catalogsClientInsertSchema.extend({
  isDefault: z.boolean().optional().default(false),
  features: z.array(featureCatalogSetupSchema),
  products: z.array(
    createProductSchema.extend({
      features: z.string().array(),
    })
  ),
  usageMeters: z.array(
    usageMetersClientInsertSchema.omit({
      catalogId: true,
    })
  ),
})
