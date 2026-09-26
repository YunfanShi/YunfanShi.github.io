import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import LinkRedirect from "@/components/content/link-redirect";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "JackYun Platform",
  robots: { index: false, follow: false },
};
export default async function ShareLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^j-[a-f0-9]{16}$/.test(code)) notFound();
  const admin = createAdminClient();
  if (!admin) throw new Error("链接服务暂时不可用。");
  const { data, error } = await admin
    .from("site_share_links")
    .select("name,url")
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw new Error("链接暂时无法加载。");
  if (!data) notFound();
  return <LinkRedirect name={data.name} url={data.url} />;
}
