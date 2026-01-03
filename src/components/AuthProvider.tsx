"use client"

import { MockSessionProvider } from "./MockSessionProvider"
import { SessionProvider } from "next-auth/react"

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Check if we are in "Static/Desktop" mode
  const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';

  if (isStatic) {
      return <MockSessionProvider>{children}</MockSessionProvider>
  }

  return <SessionProvider>{children}</SessionProvider>
}
