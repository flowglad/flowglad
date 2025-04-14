'use client';
import { PricingTable, useBilling } from '@flowglad/nextjs';

const InnerPricingTable = () => {
  const billing = useBilling();
  if (!billing.catalog) {
    return null;
  }
  const { createCheckoutSession } = billing;
  return (
    <PricingTable
      products={billing.catalog.products.map((product) => ({
        name: product.name,
        description: product.description,
        displayFeatures: product.displayFeatures,
        primaryButtonText: 'Subscribe',
        onClickPrimaryButton: () => {
          createCheckoutSession({
            successUrl: `${window.location.origin}/billing`,
            cancelUrl: `${window.location.origin}/billing`,
            autoRedirect: true,
            outputMetadata: {
              testMetadata: 'test____!!'
            },
            type: 'add_payment_method',
            targetSubscriptionId: ''
          });
        },
        secondaryButtonText: 'Learn More',
        prices: product.prices
      }))}
    />
  );
};

export default InnerPricingTable;
