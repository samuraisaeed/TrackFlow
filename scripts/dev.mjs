import { spawn } from 'node:child_process'
import path from 'node:path'

const viteBin = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')

const children = [
  spawn(process.execPath, ['server/index.cjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, TRACKFLOW_API_PORT: process.env.TRACKFLOW_API_PORT || '5287' },
  }),
  spawn(process.execPath, [viteBin, '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  }),
]

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT')
  process.exit(0)
})

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
  process.exit(0)
})

children.forEach((child) => {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown('SIGTERM')
      process.exit(code)
    }
  })
})
