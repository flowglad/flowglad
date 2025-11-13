import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  // Allow access to auth routes and sign-in/sign-up pages
  if (
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname === '/sign-in' ||
    request.nextUrl.pathname === '/sign-up'
  ) {
    return NextResponse.next();
  }

  // Validate session using BetterAuth's session validation
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  // Protect all other routes - redirect if no valid session
  if (!session?.user) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
