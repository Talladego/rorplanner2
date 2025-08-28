import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // inline dev-only plugin to accept tooltip debug POSTs and log payloads
    {
      name: 'dev-tooltip-endpoint',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          try {
            if (req.url === '/__debug/tooltip' && req.method === 'POST') {
              let body = ''
              req.on('data', (chunk) => { body += chunk })
              req.on('end', () => {
                // dev tooltip endpoint: intentionally do not log payloads
                res.statusCode = 200
                res.end('ok')
              })
              return
            }

            if (req.url === '/__debug/slot' && req.method === 'POST') {
              let body = ''
              req.on('data', (chunk) => { body += chunk })
              req.on('end', () => {
                // dev slot endpoint: intentionally do not log payloads
                res.statusCode = 200
                res.end('ok')
              })
              return
            }
          } catch (_) {
            // ignore middleware errors
          }
          next()
        })
      }
    }
  ],
})
