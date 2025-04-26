import * as R from 'ramda'
import Internal from './Internal'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { Price } from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  selectPricesAndProductsForOrganization,
  selectPricesProductsAndCatalogsForOrganization,
} from '@/db/tableMethods/priceMethods'
import { Catalog } from '@/db/schema/catalogs'

export default function ProductsPage() {
  return <Internal products={[]} />
}
