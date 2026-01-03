"use client"

import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

// Mock Session Data
const mockSession: Session = {
    user: {
        name: "Traveler",
        email: "local@meechi.app",
        image: null
    },
    expires: "9999-12-31T23:59:59.999Z"
}

export const MockSessionProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <SessionProvider 
            session={mockSession} 
            refetchInterval={0} 
            refetchOnWindowFocus={false} 
            baseUrl="/" // Prevent absolute URL issues
        >
            {children}
        </SessionProvider>
    )
}
