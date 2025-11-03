import { useBilling } from '@flowglad/nextjs';

export const SubscribeButton = () => {
  const billing = useBilling();
  const { createCheckoutSession, catalog } = billing;
  if (billing.errors && billing.errors.length > 0) {
    return (
      <div>
        Error: {billing.errors.map((error) => error.message).join(', ')}
      </div>
    );
  }
  if (!billing.loaded || !createCheckoutSession || !catalog) {
    return <div>Loading...</div>;
  }
  return (
    <button
      onClick={() =>
        createCheckoutSession({
          autoRedirect: true,
          priceId:
            catalog.products.find((product) => !product.default)?.defaultPrice
              .id || '',
          successUrl: `${window.location.origin}/success`,
          cancelUrl: `${window.location.origin}/cancel`
        })
      }
      className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-200"
    >
      Subscribe
    </button>
  );
};

export const AddPaymentMethodButton = () => {
  const billing = useBilling();
  const { createAddPaymentMethodCheckoutSession } = billing;
  if (billing.errors && billing.errors.length > 0) {
    return (
      <div>
        Error: {billing.errors.map((error) => error.message).join(', ')}
      </div>
    );
  }
  if (!billing.loaded || !createAddPaymentMethodCheckoutSession) {
    return <div>Loading...</div>;
  }
  return (
    <button
      onClick={() =>
        createAddPaymentMethodCheckoutSession({
          autoRedirect: true,
          successUrl: `${window.location.origin}/success`,
          cancelUrl: `${window.location.origin}/cancel`
        })
      }
      className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-200"
    >
      Add Payment Method
    </button>
  );
};

export const SubscriptionDemoCard = () => {
  const billing = useBilling();
  if (!billing.loaded) {
    return <div>Loading...</div>;
  } else if (billing.errors) {
    return (
      <div>
        Error: {billing.errors.map((error) => error.message).join(', ')}
      </div>
    );
  }
  const { customer, subscriptions } = billing;
  if (!customer) {
    return <div>No customer found</div>;
  }
  if (!subscriptions[0]) {
    return <SubscribeButton />;
  }
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <div className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
        Plan: {subscriptions[0].status}
      </div>
      <div className="mb-3 text-gray-600 dark:text-gray-400">
        Current Period End: {subscriptions[0]?.currentBillingPeriodEnd}
      </div>
      <div className="mb-3 text-gray-600 dark:text-gray-400">
        Current Period Start: {subscriptions[0]?.currentBillingPeriodStart}
      </div>
      <div className="mb-3 text-gray-600 dark:text-gray-400">
        Status: {subscriptions[0]?.status}
      </div>
    </div>
  );
};
