export const BETA_AGREEMENT_VERSION = '2026-09-03';

export type BetaEnrollmentStatus = 'invited' | 'accepted' | 'declined' | 'revoked';

export interface BetaEnrollment {
  user_id: string;
  status: BetaEnrollmentStatus;
  invited_at: string;
  responded_at: string | null;
  agreement_version: string | null;
}

export function isBetaActive(enrollment: Pick<BetaEnrollment, 'status'> | null | undefined): boolean {
  return enrollment?.status === 'accepted';
}

export function releaseChannel(enrollment: Pick<BetaEnrollment, 'status'> | null | undefined): 'BETA' | 'STABLE' {
  return isBetaActive(enrollment) ? 'BETA' : 'STABLE';
}

