import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
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
  }

  return {
    name: 'managed-gateway-dev-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/'
        const pathname = rawUrl.split('?')[0]
        const routeFile = routeMap[pathname]
        if (!routeFile) {
          next()
          return
        }

        try {
          const requestBody = await readIncomingRequestBody(req)
          const request = new Request(new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`), {
            method: req.method,
            headers: new Headers(Object.entries(req.headers).flatMap(([key, value]) => {
              if (Array.isArray(value)) return value.map((item) => [key, item] as const)
              return value == null ? [] : [[key, value] as const]
            })),
            body: requestBody.length > 0 ? requestBody : undefined,
          })
          const moduleUrl = `${pathToFileURL(resolve(process.cwd(), routeFile)).href}?t=${Date.now()}`
          const handlerModule = await import(moduleUrl)
          const response = await handlerModule.default.fetch(request)
          await writeNodeResponse(res, response)
        } catch (error) {
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

  const arrayBuffer = await response.arrayBuffer()
  res.end(Buffer.from(arrayBuffer))
}

export default defineConfig(({ command }) => {
  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null

  return {
    plugins: [react(), createManagedGatewayDevPlugin()],
    base: './',
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
