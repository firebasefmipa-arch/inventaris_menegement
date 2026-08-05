import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { users, accounts, sessions, verificationTokens } from "@/db/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const username = String(credentials.username).trim()
        const password = String(credentials.password)

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, username))
          .limit(1)

        if (!user || !user.password) return null
        // Hanya akun native (punya password) dengan role admin/super_admin yang bisa login di sini
        if (user.role !== "super_admin" && user.role !== "admin") return null
        if (user.status === "suspended") return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        // Kembalikan objek user — id WAJIB string
        return {
          id: user.id,
          name: user.name ?? "",
          email: user.email ?? "",
          image: user.image ?? null,
          role: user.role,
          phone: user.phone ?? null,
          department: user.department ?? null,
          status: user.status ?? "active",
        }
      },
    }),
  ],
  // JWT strategy — WAJIB untuk CredentialsProvider
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials (super_admin) — langsung lolos, authorize() sudah validasi
      if (account?.provider === "credentials") return true

      // Google OAuth — cek apakah di-suspend
      if (user.email) {
        const [existing] = await db
          .select({ status: users.status })
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1)

        if (existing?.status === "suspended") return false
      }
      return true
    },

    async jwt({ token, user, account, trigger, session }) {
      // Pertama kali login — user object tersedia
      if (user) {
        token.id = user.id
        token.role = (user as any).role ?? "user"
        token.status = (user as any).status ?? "active"
        token.phone = (user as any).phone ?? null
        token.department = (user as any).department ?? null
      }

      // Setiap request berikutnya — refresh data role dari DB
      // Ini penting agar promosi/demosi role langsung berlaku
      if (token.id && !user) {
        try {
          const [dbUser] = await db
            .select({
              role: users.role,
              status: users.status,
              phone: users.phone,
              department: users.department,
              name: users.name,
            })
            .from(users)
            .where(eq(users.id, token.id as string))
            .limit(1)

          if (dbUser) {
            token.role = dbUser.role ?? "user"
            token.status = dbUser.status ?? "active"
            token.phone = dbUser.phone ?? null
            token.department = dbUser.department ?? null
            if (dbUser.name) token.name = dbUser.name
          }
        } catch {
          // Jangan crash jika DB tidak bisa diakses
        }
      }

      // Trigger update manual (misal dari useSession().update())
      if (trigger === "update" && session) {
        if (session.phone !== undefined) token.phone = session.phone
        if (session.department !== undefined) token.department = session.department
        if (session.name) token.name = session.name
      }

      return token
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as any) ?? "user"
        session.user.status = (token.status as any) ?? "active"
        session.user.phone = (token.phone as any) ?? null
        session.user.department = (token.department as any) ?? null
      }
      return session
    },

    async redirect({ url, baseUrl }) {
      // Setelah Google OAuth, selalu arahkan ke /auth/callback untuk routing berdasarkan role
      if (url.startsWith(baseUrl)) {
        // Jika sudah ke halaman spesifik (bukan default), biarkan
        if (url.includes("/auth/callback") || url.includes("/dashboard") || url.includes("/admin") || url.includes("/register")) {
          return url
        }
        // Default redirect ke /auth/callback
        return `${baseUrl}/auth/callback`
      }
      // URL eksternal — arahkan ke callback
      return `${baseUrl}/auth/callback`
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
