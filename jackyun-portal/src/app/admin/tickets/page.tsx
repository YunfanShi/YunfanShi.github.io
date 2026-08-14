import { getAdminBugReports } from '@/actions/feedback';
import BugReportsPanel from '@/components/admin/bug-reports-panel';
import { AdminPageHeader } from '@/components/admin/page-header';
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) { const reports = await getAdminBugReports(); const { ticket } = await searchParams; return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="工单" description="筛选、跟进和回复用户反馈；内部备注不会向用户暴露。" /><BugReportsPanel reports={reports} initialTicketId={ticket} /></div>; }
