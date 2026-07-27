export default async function middleware(request) {
  return;
}

export const config = {
  matcher: [
    '/',
    '/:path*',
    '/((?!_next/|favicon.ico|icons/|assets/|public/|.*\\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|json|webmanifest|txt|xml|pdf|map)$).*)'
  ]
};
