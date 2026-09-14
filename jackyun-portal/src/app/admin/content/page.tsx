import ContentLibraryPanel from '@/components/admin/content-library-panel';
import { getReaderAdminDashboard } from '@/actions/reader-admin';

export default async function AdminContentPage() {
  const data = await getReaderAdminDashboard();
  return <ContentLibraryPanel initialFeatures={data.features} initialNovels={data.novels} initialCodes={data.codes} initialTags={data.tags} />;
}
