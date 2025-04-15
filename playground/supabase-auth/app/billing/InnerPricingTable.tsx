'use client';
import Button from '@/components/ui/Button';
import { BillingPage, PricingTable, useBilling } from '@flowglad/nextjs';

const InnerPricingTable = () => {
  const billing = useBilling();
  if (!billing.catalog) {
    return null;
  }
  const { createCheckoutSession, reload } = billing;
  return (
    <>
      <Button onClick={reload}>Reload</Button>
      <BillingPage darkMode={true} />
    </>
  );
};

export default InnerPricingTable;
