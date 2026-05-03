import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { createDevRequestId, devLog, installDevProcessLogging, serializeError } from './server/dev-log.js'
import { normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

function createManagedGatewayDevPlugin() {
  const routeMap: Record<string, string> = {
    '/api/session': 'api/session.js',
    '/api/login': 'api/login.js',
    '/api/logout': 'api/logout.js',
    '/api/generate': 'api/generate.js',
    '/api/admin/session': 'api/admin/session.js',
    '/api/admin/customers': 'api/admin/customers.js',
    '/api/admin/credits': 'api/admin/credits.js',
    '/api/admin/redeem-codes': 'api/admin/redeem-codes.js',
    '/api/admin/usage': 'api/admin/usage.js',
  }

  return {
    name: 'managed-gateway-dev-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/'
        const pathname = rawUrl.split('?')[0]
        if (pathname === '/admin') {
          res.statusCode = 302
          res.setHeader('Location', '/admin/')
          res.end()
          return
        }
        const routeFile = routeMap[pathname]
        if (!routeFile) {
          next()
          return
        }

        try {
          const requestId = createDevRequestId('http')
          const startedAt = Date.now()
          const requestBody = await readIncomingRequestBody(req)
          const headers = new Headers(Object.entries(req.headers).flatMap(([key, value]) => {
            if (Array.isArray(value)) return value.map((item) => [key, item] as const)
            return value == null ? [] : [[key, value] as const]
          }))
          headers.set('x-request-id', requestId)
          devLog('dev-api', 'request-start', {
            requestId,
            method: req.method,
            path: rawUrl,
            bodyBytes: requestBody.length,
          })

          const request = new Request(new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`), {
            method: req.method,
            headers,
            body: requestBody.length > 0 ? requestBody : undefined,
          })
          const moduleUrl = `${pathToFileURL(resolve(process.cwd(), routeFile)).href}?t=${Date.now()}`
          const handlerModule = await import(moduleUrl)
          const response = await handlerModule.default.fetch(request)
          devLog('dev-api', 'request-finish', {
            requestId,
            method: req.method,
            path: rawUrl,
            status: response.status,
            elapsedMs: Date.now() - startedAt,
          })
          await writeNodeResponse(res, response)
        } catch (error) {
          devLog('dev-api', 'request-error', {
            method: req.method,
            path: rawUrl,
            error: serializeError(error),
          })
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          }))
        }
      })
    },
  }
}

function readIncomingRequestBody(req: import('http').IncomingMessage) {
  return new Promise<Buffer>((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function writeNodeResponse(res: import('http').ServerResponse, response: Response) {
  res.statusCode = response.status
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (typeof getSetCookie === 'function') {
    const cookies = getSetCookie.call(response.headers)
    if (cookies.length > 0) {
      res.setHeader('set-cookie', cookies)
    }
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        res.write(Buffer.from(value))
      }
    }
    res.end()
    return
  }

  const arrayBuffer = await response.arrayBuffer()
  res.end(Buffer.from(arrayBuffer))
}

export default defineConfig(({ command, mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(loadedEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  installDevProcessLogging()

  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null

  return {
    plugins: [react(), createManagedGatewayDevPlugin()],
    base: './',
    build: {
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), 'index.html'),
          admin: resolve(process.cwd(), 'admin/index.html'),
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
    },
    server: {
      host: true,
      proxy:
        devProxyConfig?.enabled
          ? {
              [devProxyConfig.prefix]: {
                target: devProxyConfig.target,
                changeOrigin: devProxyConfig.changeOrigin,
                secure: devProxyConfig.secure,
                rewrite: (path) =>
                  path.replace(
                    new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
                    '',
                  ),
              },
            }
          : undefined,
    },
  }
})
