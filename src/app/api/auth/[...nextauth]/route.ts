import { handlers } from "@/auth"
import { NextRequest } from "next/server"

// Workaround Auth.js v5 + gateway strip-prefix UII.
// Next.js basePath = /empati: Next otomatis strip /empati dari pathname
// sebelum route matching, jadi request /empati/api/auth/... sampai ke route
// handler ini sebagai /api/auth/... Auth.js dikonfigurasi basePath
// /empati/api/auth (agar callback URL menyertakan /empati), maka prefix
// ditambahkan kembali (addBase) sebelum diteruskan ke Auth.js.
const PREFIX = process.env.NEXT_PUBLIC_BASE_PATH || ""

function addBase(req: NextRequest) {
  if (!PREFIX) return req
  const url = req.nextUrl.clone()
  if (url.pathname.startsWith("/api/auth")) {
    url.pathname = `${PREFIX}${url.pathname}`
  }
  return new NextRequest(url.toString(), req)
}

export const GET = (req: NextRequest) => handlers.GET(addBase(req))
export const POST = (req: NextRequest) => handlers.POST(addBase(req))
