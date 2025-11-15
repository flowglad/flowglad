'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
  const router = useRouter();

  // Redirect pricing page to home with pricing view
  useEffect(() => {
    router.replace('/?view=pricing');
  }, [router]);

  return null;
}
