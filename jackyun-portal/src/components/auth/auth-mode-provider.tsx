'use client';

import { createContext, useContext, type ReactNode } from 'react';

const AuthModeContext = createContext<{ signedIn: boolean; userId: string | null }>({ signedIn: false, userId: null });

export function useAuthMode() {
  return useContext(AuthModeContext);
}

export default function AuthModeProvider({ signedIn, userId, children }: { signedIn: boolean; userId: string | null; children: ReactNode }) {
  return <AuthModeContext.Provider value={{ signedIn, userId }}>{children}</AuthModeContext.Provider>;
}
