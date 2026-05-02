const SESSION_COOKIE_NAME = 'gip_session'

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME
}

export function parseCookies(request) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  return cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim()
    if (!trimmed) return acc
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex < 0) return acc
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    acc[key] = decodeURIComponent(value)
    return acc
  }, {})
}

function shouldUseSecureCookies(request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedProto) return forwardedProto === 'https'

  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function createSessionCookie(request, token, expiresAt) {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: shouldUseSecureCookies(request),
    expires: expiresAt,
  })
}

export function createClearedSessionCookie(request) {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: shouldUseSecureCookies(request),
    expires: new Date(0),
    maxAge: 0,
  })
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.path) parts.push(`Path=${options.path}`)
  return parts.join('; ')
}
