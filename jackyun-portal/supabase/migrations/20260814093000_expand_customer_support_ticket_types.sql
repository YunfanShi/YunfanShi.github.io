ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_ticket_type_check;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_ticket_type_check CHECK (ticket_type IN ('bug', 'suggestion', 'usage_help', 'account_security', 'suspension_appeal', 'deletion_recovery'));
