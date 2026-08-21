'use client';

import { createContext, useContext, type ReactNode } from 'react';

const AuthModeContext = createContext({ signedIn: false });

export function useAuthMode() {
  return useContext(AuthModeContext);
}

export default function AuthModeProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return <AuthModeContext.Provider value={{ signedIn }}>{children}</AuthModeContext.Provider>;
}
