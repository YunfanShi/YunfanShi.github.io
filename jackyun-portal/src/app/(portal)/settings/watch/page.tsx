import { redirect } from 'next/navigation';

export default async function WatchSettingsPage({ searchParams }: { searchParams: Promise<{ pair?: string }> }) {
  const { pair } = await searchParams;
  const query = new URLSearchParams({ section: 'watch' });
  if (pair) query.set('pair', pair);
  redirect(`/settings?${query.toString()}`);
}
