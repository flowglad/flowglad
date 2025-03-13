import { BillingPage } from '@flowglad/nextjs';
import { flowgladServer } from '@/utils/flowglad';

export default async () => {
  const billing = await flowgladServer.getBilling();
  return <BillingPage billing={billing} />;
};
