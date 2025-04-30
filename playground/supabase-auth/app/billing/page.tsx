import { flowgladServer } from '@/utils/flowglad';
import InnerPricingTable from './InnerPricingTable';
import { BillingPage } from '@flowglad/react';

export default async () => {
  const billing = await flowgladServer.getBilling();
  if (billing.currentSubscriptions?.length) {
    return <BillingPage darkMode={true} />;
  }
  return <InnerPricingTable />;
};
