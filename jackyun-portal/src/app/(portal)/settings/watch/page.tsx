import WatchSettingsPanel from '@/components/settings/watch-settings-panel';
export default async function WatchSettingsPage({searchParams}:{searchParams:Promise<{pair?:string}>}) {
  const params=await searchParams;
  return <main className="mx-auto w-full max-w-3xl px-4 py-6"><WatchSettingsPanel initialPair={params.pair??''} /></main>;
}
