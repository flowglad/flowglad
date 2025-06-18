'use client';

import { useBilling } from '@flowglad/nextjs';

export const FeatureCheck = () => {
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
