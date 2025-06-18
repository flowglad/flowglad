'use client';

import { useBilling } from '@flowglad/nextjs';

const FeatureAccessCheck = () => {
  const { checkFeatureAccess, loaded } = useBilling();
  const hasFeature = checkFeatureAccess && checkFeatureAccess('feature-1');
  if (!loaded) {
    return <div>Loading...</div>;
  }
  if (!hasFeature) {
    return <div>You do not have access to this feature</div>;
  }
  return <div>You have access to this feature</div>;
};
const UsageBalanceCheck = () => {
  const { checkUsageBalance, loaded } = useBilling();
  const usageBalance = checkUsageBalance && checkUsageBalance('usage-1');
  if (!loaded) {
    return <div>Loading...</div>;
  }
  if (!usageBalance) {
    return <div>No such balance</div>;
  }
  return <div>You have {usageBalance.availableBalance} credits</div>;
};

export const FeatureCheck = () => {
  const { loaded } = useBilling();
  if (!loaded) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <FeatureAccessCheck />
      <UsageBalanceCheck />
    </>
  );
};
