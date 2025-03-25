import { flowgladServer } from '@/utils/flowglad';
import InnerPricingTable from './InnerPricingTable';

export default async () => {
  const billing = await flowgladServer.getBilling();
  return <InnerPricingTable />;
};
