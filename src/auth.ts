import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // @ts-expect-error - Adding accessToken to session for API usage
      session.accessToken = token.accessToken
      return session
    },
    async jwt({ token, account }) {
      // 1. Initial Sign In
      if (account) {
        return {
          accessToken: account.access_token,
          expiresAt: Date.now() + (account.expires_in as number) * 1000,
          refreshToken: account.refresh_token,
        }
      }

      // 2. Return previous token if valid (buffer of 10s)
      if (Date.now() < (token.expiresAt as number) - 10000) {
        return token
      }

      // 3. Access Token has expired, try to update it
      try {
        console.log("Refreshing Google Access Token...");
        // https://accounts.google.com/.well-known/openid-configuration
        // token_endpoint: "https://oauth2.googleapis.com/token"
        
        const response = await fetch("https://oauth2.googleapis.com/token", {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refreshToken as string,
          }),
          method: "POST",
        })

        const tokens = await response.json()

        if (!response.ok) throw tokens

        return {
          ...token,
          accessToken: tokens.access_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
          // Fall back to old refresh token if new one not provided
          refreshToken: tokens.refresh_token ?? token.refreshToken,
        }
      } catch (error) {
        console.error("Error refreshing Access Token", error)
        return { ...token, error: "RefreshAccessTokenError" }
      }
    },
  },
})
