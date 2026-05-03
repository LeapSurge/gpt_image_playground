export function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown'
}
