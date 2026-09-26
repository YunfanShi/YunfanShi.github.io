import { getSiteContent } from "@/actions/site-content";
import SiteContentPanel from "@/components/admin/site-content-panel";
export default async function AdminContentPage() {
  const data = await getSiteContent();
  return <SiteContentPanel {...data} />;
}
