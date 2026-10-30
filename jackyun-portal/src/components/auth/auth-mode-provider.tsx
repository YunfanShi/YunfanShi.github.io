'use client';

import { createContext, useContext, type ReactNode } from 'react';

const AuthModeContext = createContext<{ signedIn: boolean; userId: string | null; isAdmin:boolean }>({ signedIn: false, userId: null,isAdmin:false });

export function useAuthMode() {
  return useContext(AuthModeContext);
}

export default function AuthModeProvider({ signedIn, userId, isAdmin=false, children }: { signedIn: boolean; userId: string | null; isAdmin?:boolean; children: ReactNode }) {
  return <AuthModeContext.Provider value={{ signedIn, userId,isAdmin }}>{children}</AuthModeContext.Provider>;
}
