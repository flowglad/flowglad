'use client';
import Button from '@/components/ui/Button';
import { useBilling } from '@flowglad/nextjs';

const InnerPricingTable = () => {
  const billing = useBilling();
  if (!billing.catalog) {
    return null;
  }
  const { reload } = billing;
  return (
    <>
      <Button onClick={reload}>Reload</Button>
    </>
  );
};

export default InnerPricingTable;
