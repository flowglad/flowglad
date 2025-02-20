import { useBilling } from '@flowglad/next';

const SubscribeButton = () => {
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
  const { createPurchaseSession, catalog } = billing;
  return (
    <button
      onClick={() =>
        createPurchaseSession({
          autoRedirect: true,
          VariantId: catalog.products[0].variants[0].id,
          successUrl: 'http://localhost:3002/success',
          cancelUrl: 'http://localhost:3002/cancel'
        })
      }
      className="bg-blue-500 text-white px-4 py-2 rounded-md"
    >
      Subscribe
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
  const { customerProfile, subscriptions } = billing;
  if (!customerProfile) {
    return <div>No customer profile found</div>;
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
        Current Period End: {subscriptions[0]?.currentPeriodStart}
      </div>
      <div className="mb-3 text-gray-600 dark:text-gray-400">
        Current Period Start: {subscriptions[0]?.currentPeriodStart}
      </div>
      <div className="mb-3 text-gray-600 dark:text-gray-400">
        Status: {subscriptions[0]?.status}
      </div>
    </div>
  );
};
