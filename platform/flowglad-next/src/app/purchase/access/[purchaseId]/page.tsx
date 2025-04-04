import { adminTransaction } from '@/db/adminTransaction'
import { PurchaseStatus } from '@/types'
import PendingPostPurchaseScreen from './PendingPostPurchaseScreen'
import { findPurchaseAccessSession } from '@/utils/purchaseAccessSessionState'
import { selectPurchaseCheckoutParametersById } from '@/db/tableMethods/purchaseMethods'
import PostPurchaseEmailConfirmationForm from './PostPurchaseEmailConfirmationForm'
import AccessResourcesView from './AccessResourcesView'

/**
 *
 * Makes it so that it will replace all but the first and
 * last characters before the @, and then all but the first
 * letter of the domain, but then preserves the TLD
 *
 * so:
 * agree@gmail.com =>
 * a***e@g***l.com
 * @returns
 */
const maskEmail = (email: string) => {
  const [localPart, domain] = email.split('@')
  const [domainName, tld] = domain.split('.')

  const maskedLocalPart =
    localPart.length <= 2
      ? localPart
      : `${localPart[0]}${Array(localPart.length - 2)
          .fill('*')
          .join('')}${localPart[localPart.length - 1]}`

  const maskedDomain =
    domainName.length <= 1
      ? domainName
      : `${domainName[0]}${Array(domainName.length - 1)
          .fill('*')
          .join('')}`

  return `${maskedLocalPart}@${maskedDomain}.${tld}`
}

interface PostPurchasePageProps {
  params: Promise<{
    purchaseId: string
  }>
}

const PostPurchasePage = async ({
  params,
}: PostPurchasePageProps) => {
  const { purchaseId } = await params
  const { purchaseAccessSession, purchase, customer } =
    await adminTransaction(async ({ transaction }) => {
      const purchaseAccessSession = await findPurchaseAccessSession(
        purchaseId,
        transaction
      )

      const { purchase, product, price, organization, customer } =
        await selectPurchaseCheckoutParametersById(
          purchaseId,
          transaction
        )

      return {
        purchaseAccessSession,
        purchase,
        product,
        price,
        organization,
        customer,
      }
    })
  const customerEmail = customer.email!

  const emailConfirmationForm = (
    <PostPurchaseEmailConfirmationForm
      purchaseId={purchase.id}
      maskedEmail={maskEmail(customerEmail)}
      livemode={purchase.livemode}
    />
  )

  if (!purchaseAccessSession) {
    return emailConfirmationForm
  }

  if (purchase.status === PurchaseStatus.Pending) {
    return <PendingPostPurchaseScreen purchaseId={purchase.id} />
  }

  return <AccessResourcesView files={[]} links={[]} />
}

export default PostPurchasePage
