'use client';

import ReadingWorkbench from './reading-workbench';
import { useOfflineSnapshot } from '@/hooks/use-offline-snapshot';
import type { ReaderBootstrap } from '@/actions/reader';

export default function OfflineReadingWorkbench({ bootstrap }: { bootstrap: ReaderBootstrap }) {
  if (!bootstrap.userId) return <ReadingWorkbench bootstrap={bootstrap} />;
  return <SignedInReading bootstrap={bootstrap} userId={bootstrap.userId} />;
}

function SignedInReading({ bootstrap, userId }: { bootstrap: ReaderBootstrap; userId: string }) {
  const [cached] = useOfflineSnapshot(userId, 'reading', bootstrap);
  return <ReadingWorkbench bootstrap={cached} />;
}
