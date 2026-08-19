'use client';

import { useEffect, useState } from 'react';
import { RepoIntake } from '@/components/RepoIntake';
import { Workspace } from '@/components/Workspace';
import { AuthGate } from '@/components/AuthGate';
import { BackendGate } from '@/components/BackendGate';
import { useUserId } from '@/lib/userContext';
import {
  getCurrentRepoId,
  setCurrentRepoId,
  clearCurrentRepoId,
} from '@/lib/recentRepos';

function App() {
  const userId = useUserId();
  const [repoId, setRepoId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Restore the last-open repo after mount so an accidental reload (or a
  // misclicked "New repo") doesn't strand the user on an empty screen.
  // Runs client-side only — localStorage is unavailable during SSR.
  useEffect(() => {
    setRepoId(getCurrentRepoId(userId));
    setRestored(true);
  }, [userId]);

  const open = (id: string) => {
    setCurrentRepoId(userId, id);
    setRepoId(id);
  };

  const reset = () => {
    clearCurrentRepoId(userId);
    setRepoId(null);
  };

  // Avoid a flash of the intake screen before restoration completes.
  if (!restored) return null;

  if (!repoId) {
    return <RepoIntake onIngested={open} />;
  }
  return <Workspace repoId={repoId} onReset={reset} />;
}

export default function Home() {
  return (
    <BackendGate>
      <AuthGate>
        <App />
      </AuthGate>
    </BackendGate>
  );
}
