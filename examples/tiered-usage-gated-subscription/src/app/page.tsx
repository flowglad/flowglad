import { Suspense } from 'react';
import { HomeClient } from './home-client';
import { DashboardSkeleton } from '@/components/dashboard-skeleton';

export default async function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HomeClient />
    </Suspense>
  );
}
