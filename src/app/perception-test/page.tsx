import { notFound } from 'next/navigation';

import { PerceptionTestClient } from './perception-test-client';

export const dynamic = 'force-dynamic';

export default function PerceptionTestPage() {
  const enabled =
    process.env.ENABLE_PERCEPTION_TEST_ROUTE === 'true' ||
    process.env.NEXT_PUBLIC_ENABLE_PERCEPTION_TEST_ROUTE === 'true';

  if (!enabled) {
    notFound();
  }

  return <PerceptionTestClient />;
}

