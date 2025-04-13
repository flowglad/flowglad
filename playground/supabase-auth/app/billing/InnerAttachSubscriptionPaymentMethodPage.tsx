'use client';

import Button from '@/components/ui/Button';
import { useBilling } from '@flowglad/nextjs';

const InnerAttachSubscriptionPaymentMethodPage = () => {
  const { createAddPaymentMethodCheckoutSession, currentSubscriptions } =
    useBilling();

  return (
    <div>
      <h1>Hello World</h1>
      <Button
        onClick={async () => {
          if (!createAddPaymentMethodCheckoutSession || !currentSubscriptions) {
            return;
          }
          await createAddPaymentMethodCheckoutSession({
            targetSubscriptionId: currentSubscriptions[0].id,
            successUrl: window.location.href,
            cancelUrl: window.location.href,
            autoRedirect: true
          });
        }}
      >
        Attach Payment Method
      </Button>
    </div>
  );
};

export default InnerAttachSubscriptionPaymentMethodPage;
