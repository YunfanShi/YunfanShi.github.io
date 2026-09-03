export interface AdminIdentity {
  email?: string | null;
}

function entries(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

/** Keep administrator identity consistent across email and OAuth sign-in. */
export function isAdminIdentity(
  user: AdminIdentity,
  profileRole: string | null | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (profileRole === 'admin') return true;
  const email = user.email?.trim().toLowerCase() ?? '';
  const adminEmails = new Set([
    ...entries(environment.ADMIN_EMAILS),
    ...entries(environment.ADMIN_USERS).filter((item) => item.includes('@')),
  ]);
  return Boolean(email && adminEmails.has(email));
}
