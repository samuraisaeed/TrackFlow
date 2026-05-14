import type { TrackFlowState } from './types'

export interface StorageInfo {
  rootDir: string
  dataDir: string
  workspaceFile: string
  backupsDir: string
  reportsDir: string
}

export interface WorkspaceResponse {
  workspace: TrackFlowState | null
  storage: StorageInfo | null
  loadedFromFile?: boolean
  savedAt?: string
}

export interface BackupResponse extends WorkspaceResponse {
  backupPath: string
}

export interface ReportResponse {
  reportPath: string
  storage: StorageInfo | null
  savedAt: string
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options?.headers,
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload.error === 'string' ? payload.error : `Request failed: ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export function loadWorkspaceFromApi() {
  return requestJson<WorkspaceResponse>('/api/workspace')
}

export function saveWorkspaceToApi(workspace: TrackFlowState) {
  return requestJson<WorkspaceResponse>('/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace }),
  })
}

export function saveBackupToApi(workspace: TrackFlowState) {
  return requestJson<BackupResponse>('/api/backup', {
    method: 'POST',
    body: JSON.stringify({ workspace }),
  })
}

export function importWorkspaceToApi(workspace: TrackFlowState) {
  return requestJson<BackupResponse>('/api/import', {
    method: 'POST',
    body: JSON.stringify({ workspace }),
  })
}

export function saveReportToApi(reportText: string) {
  return requestJson<ReportResponse>('/api/report', {
    method: 'POST',
    body: JSON.stringify({ reportText }),
  })
}
