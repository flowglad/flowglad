import { PricingTable } from '@flowglad/nextjs';
import { flowgladServer } from '@/utils/flowglad';
import BillingPricingTable from './BillingPricingTable';

export default async () => {
  const billing = await flowgladServer.getBilling();
  return <BillingPricingTable />;
};
