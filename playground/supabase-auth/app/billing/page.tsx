import { BillingPage, PricingTable } from '@flowglad/nextjs';
import { flowgladServer } from '@/utils/flowglad';

export default async () => {
  const billing = await flowgladServer.getBilling();
  return (
    <PricingTable
      products={billing.catalog.products.map((product) => ({
        name: product.name,
        description: product.description,
        displayFeatures: product.displayFeatures,
        primaryButtonText: 'Subscribe',
        secondaryButtonText: 'Learn More',
        prices: product.prices
      }))}
    />
  );
};
