import { flowgladServer } from '@/utils/flowglad';
import InnerPricingTable from './InnerPricingTable';
// import { BillingPage } from '@flowglad/nextjs';
import InnerAttachSubscriptionPaymentMethodPage from './InnerAttachSubscriptionPaymentMethodPage';

export default async () => {
  const billing = await flowgladServer.getBilling();
  if (billing.currentSubscriptions?.length) {
    return <InnerAttachSubscriptionPaymentMethodPage />;
  }
  return <InnerPricingTable />;
};
