import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

// Full (Node) NextAuth instance — used by the route handler and server code.
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
