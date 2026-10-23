import { NextRequest, NextResponse } from "next/server";
import { COOKIE, parseSessionToken } from "@/lib/auth";
import { sessionAdmin } from "@/lib/session";

const OPEN = ["/login", "/primeiro-acesso", "/convite/", "/_next"];

// Tudo exige entrada, menos o login, o primeiro acesso e o link de convite.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`))) return NextResponse.next();
  const token = request.cookies.get(COOKIE)?.value;
  if (!parseSessionToken(token) || !(await sessionAdmin(token).catch(() => null))) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"] };
