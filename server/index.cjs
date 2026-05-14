const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createReadStream } = require('node:fs')

const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const workspaceFile = path.join(dataDir, 'workspace.json')
const backupsDir = path.join(dataDir, 'backups')
const reportsDir = path.join(dataDir, 'reports')
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.TRACKFLOW_API_PORT || 5287)

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
}

function storageInfo() {
  return {
    rootDir,
    dataDir,
    workspaceFile,
    backupsDir,
    reportsDir,
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function ensureStorage() {
  await fs.mkdir(backupsDir, { recursive: true })
  await fs.mkdir(reportsDir, { recursive: true })
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, jsonHeaders)
  response.end(JSON.stringify(payload, null, 2))
}

function validateWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') return 'Workspace must be an object.'
  if (!workspace.project || typeof workspace.project.name !== 'string') return 'Workspace is missing project details.'
  if (!Array.isArray(workspace.members)) return 'Workspace members must be an array.'
  if (!Array.isArray(workspace.deliverables)) return 'Workspace deliverables must be an array.'
  if (!Array.isArray(workspace.tasks)) return 'Workspace tasks must be an array.'
  if (!Array.isArray(workspace.submissions)) return 'Workspace submissions must be an array.'
  if (!Array.isArray(workspace.workLogs)) return 'Workspace workLogs must be an array.'
  return null
}

async function loadWorkspace() {
  try {
    const raw = await fs.readFile(workspaceFile, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function saveWorkspace(workspace) {
  const validationError = validateWorkspace(workspace)
  if (validationError) {
    const error = new Error(validationError)
    error.statusCode = 400
    throw error
  }

  await ensureStorage()
  const next = {
    ...workspace,
    project: {
      ...workspace.project,
      updatedAt: new Date().toISOString(),
    },
  }
  await fs.writeFile(workspaceFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

async function writeBackup(workspace) {
  await ensureStorage()
  const filename = `trackflow-workspace-${stamp()}.json`
  const filePath = path.join(backupsDir, filename)
  await fs.writeFile(filePath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8')
  return filePath
}

async function writeReport(reportText) {
  await ensureStorage()
  const filename = `TrackFlow-final-report-${stamp()}.md`
  const filePath = path.join(reportsDir, filename)
  await fs.writeFile(filePath, reportText, 'utf8')
  return filePath
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath)
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.json') return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

async function serveStatic(request, response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const requestedPath = path.resolve(distDir, relativePath)
  const safePath = requestedPath.startsWith(distDir) ? requestedPath : path.join(distDir, 'index.html')

  try {
    await fs.access(safePath)
    response.writeHead(200, { 'content-type': contentTypeFor(safePath) })
    createReadStream(safePath).pipe(response)
  } catch {
    const indexPath = path.join(distDir, 'index.html')
    try {
      await fs.access(indexPath)
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      createReadStream(indexPath).pipe(response)
    } catch {
      sendJson(response, 404, {
        error: 'Frontend build not found. Run npm run build, or use npm run dev for the Vite app.',
        storage: storageInfo(),
      })
    }
  }
}

async function handleApi(request, response, pathname) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, jsonHeaders)
    response.end()
    return
  }

  if (pathname === '/api/health' && request.method === 'GET') {
    await ensureStorage()
    sendJson(response, 200, { ok: true, storage: storageInfo() })
    return
  }

  if (pathname === '/api/workspace' && request.method === 'GET') {
    await ensureStorage()
    const workspace = await loadWorkspace()
    sendJson(response, 200, { workspace, storage: storageInfo(), loadedFromFile: Boolean(workspace) })
    return
  }

  if (pathname === '/api/workspace' && request.method === 'PUT') {
    const payload = JSON.parse(await readBody(request))
    const workspace = await saveWorkspace(payload.workspace)
    sendJson(response, 200, { workspace, storage: storageInfo(), savedAt: new Date().toISOString() })
    return
  }

  if (pathname === '/api/backup' && request.method === 'POST') {
    const payload = JSON.parse(await readBody(request))
    const workspace = await saveWorkspace(payload.workspace)
    const backupPath = await writeBackup(workspace)
    sendJson(response, 200, { workspace, backupPath, storage: storageInfo(), savedAt: new Date().toISOString() })
    return
  }

  if (pathname === '/api/import' && request.method === 'POST') {
    const payload = JSON.parse(await readBody(request))
    const workspace = await saveWorkspace(payload.workspace)
    const backupPath = await writeBackup(workspace)
    sendJson(response, 200, { workspace, backupPath, storage: storageInfo(), savedAt: new Date().toISOString() })
    return
  }

  if (pathname === '/api/report' && request.method === 'POST') {
    const payload = JSON.parse(await readBody(request))
    const reportPath = await writeReport(String(payload.reportText || ''))
    sendJson(response, 200, { reportPath, storage: storageInfo(), savedAt: new Date().toISOString() })
    return
  }

  sendJson(response, 404, { error: 'Unknown API route.' })
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url.pathname)
      return
    }
    await serveStatic(request, response, url.pathname)
  } catch (error) {
    const statusCode = error.statusCode || 500
    sendJson(response, statusCode, {
      error: error.message || 'Unexpected TrackFlow server error.',
      storage: storageInfo(),
    })
  }
})

ensureStorage()
  .then(() => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`TrackFlow API running at http://127.0.0.1:${port}`)
      console.log(`Workspace file: ${workspaceFile}`)
    })
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
