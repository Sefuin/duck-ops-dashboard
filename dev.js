import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = __dirname
const viteBin =
  process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', '.bin', 'vite.cmd')
    : path.join(rootDir, 'node_modules', '.bin', 'vite')

const PORT = Number(process.env.DUCK_API_PORT || 3020)
let shuttingDown = false

function waitForPort(port, host = '127.0.0.1', timeoutMs = 15000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`API server did not start within ${timeoutMs}ms`))
      }
      const socket = createConnection({ port, host }, () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => {
        socket.destroy()
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

const children = []

function registerChild(name, child) {
  children.push(child)

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(
      `${name} exited unexpectedly (code ${code ?? 'unknown'}, signal ${signal ?? 'none'}). Shutting down the duck dashboard dev session.`,
    )
    shutdown(code ?? 1)
  })

  child.on('error', (error) => {
    if (shuttingDown) return
    console.error(`${name} failed to start: ${error.message}`)
    shutdown(1)
  })

  return child
}

registerChild('Duck API', spawn(
  process.execPath,
  [path.join(rootDir, 'server', 'index.js')],
  { cwd: rootDir, stdio: 'inherit' },
))

waitForPort(PORT)
  .then(() => {
    registerChild('Duck UI', spawn(
      viteBin,
      ['--config', 'vite.config.js', '--configLoader', 'native'],
      { cwd: rootDir, stdio: 'inherit', shell: process.platform === 'win32' },
    ))
  })
  .catch((error) => {
    console.error(error.message)
    shutdown(1)
  })

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  process.exit(exitCode)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
