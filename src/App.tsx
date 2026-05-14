import type { ChangeEvent, CSSProperties, FormEvent, ReactNode } from 'react'
import { useDeferredValue, useEffect, useState } from 'react'
import './App.css'
import {
  importWorkspaceToApi,
  loadWorkspaceFromApi,
  saveBackupToApi,
  saveReportToApi,
  saveWorkspaceToApi,
  type StorageInfo,
} from './api'
import { buildReport } from './report'
import { createSeedWorkspace, defaultEmployeePermissions } from './seed'
import type {
  Deliverable,
  PermissionSet,
  Priority,
  Project,
  RiskFlag,
  TrackFlowState,
  Settings,
  SortMode,
  SubmissionStatus,
  Task,
  TaskStatus,
  TaskSubmission,
  TeamMember,
  UserRole,
  VisibilityScope,
  WorkLog,
} from './types'

const STORAGE_KEY = 'trackflow:v1'

type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline'

type View = 'dashboard' | 'deliverables' | 'tasks' | 'team' | 'submissions' | 'evidence' | 'risks' | 'report' | 'settings'

interface SetupDraft {
  project: Project
  template: string
  deliverables: Deliverable[]
  members: TeamMember[]
}

interface SubmissionDraft {
  taskId: string
  date: string
  hours: string
  description: string
}

interface TaskDraft {
  title: string
  description: string
  deliverableId: string
  ownerId: string
  status: TaskStatus
  priority: Priority
  dueAt: string
}

const navItems: { id: View; label: string; sub: string }[] = [
  { id: 'dashboard', label: 'Dashboard', sub: 'Control room' },
  { id: 'deliverables', label: 'Deliverables', sub: 'Manager ownership' },
  { id: 'tasks', label: 'Task Board', sub: 'Urgent / pending / done' },
  { id: 'team', label: 'Teams', sub: 'Hierarchy and access' },
  { id: 'submissions', label: 'Task Submissions', sub: 'Hours and completion' },
  { id: 'evidence', label: 'Submission Records', sub: 'Manager review' },
  { id: 'risks', label: 'Risk Flags', sub: 'Neutral alerts' },
  { id: 'report', label: 'Final Report', sub: 'Stakeholder export' },
  { id: 'settings', label: 'Settings', sub: 'Permissions and data' },
]

const pageHelp: Record<View, string> = {
  dashboard: 'Role-aware project health, upcoming deadlines, pending reviews, and hours visibility.',
  deliverables: 'Project managers assign deliverables to managers; managers break them into team tasks.',
  tasks: 'Tasks are grouped vertically by urgent pending, regular pending, and done.',
  team: 'Manage the PM to manager to employee tree, plus per-person access toggles.',
  submissions: 'Employees submit completed work against their own tasks with required hours and description.',
  evidence: 'Managers review, approve, return, or remove task submissions without deleting logged hours.',
  risks: 'Neutral signals for overdue, blocked, unowned, unreviewed, or unsupported work.',
  report: 'Generate a corporate-ready summary from live project data.',
  settings: 'Control role permissions, local storage, backup, import, and reset options.',
}

const templateCatalog = [
  { name: 'Blank corporate workspace', helper: 'Start empty', deliverables: [] },
  {
    name: 'Product launch',
    helper: 'Launch planning, enablement, analytics',
    deliverables: ['Launch Plan', 'Sales Enablement Kit', 'Customer Rollout Checklist', 'Post Launch Metrics'],
  },
  {
    name: 'AI platform implementation',
    helper: 'Prototype, security, adoption, reporting',
    deliverables: ['Technical Prototype', 'Security Review', 'Pilot Team Rollout', 'Executive Readout'],
  },
  {
    name: 'Client engagement',
    helper: 'Discovery, delivery, validation, handoff',
    deliverables: ['Discovery Summary', 'Solution Build', 'Client Validation', 'Final Handoff Report'],
  },
  {
    name: 'Operations improvement',
    helper: 'Process mapping, implementation, training',
    deliverables: ['Current State Map', 'Improvement Plan', 'Training Materials', 'Adoption Dashboard'],
  },
]

const memberColors = ['#0F766E', '#2563EB', '#F97316', '#D946EF', '#0891B2', '#BE3455', '#65A30D', '#7C3AED']
const deliverableColors = ['#60A5FA', '#34D399', '#FBBF24', '#C084FC', '#F472B6', '#F97316', '#0891B2']

const roleMeta: Record<UserRole, { label: string; tone: string }> = {
  'project-manager': { label: 'Project Manager', tone: 'teal' },
  manager: { label: 'Manager', tone: 'blue' },
  employee: { label: 'Employee', tone: 'gray' },
}

const roleDefaultTitle: Record<UserRole, string> = {
  'project-manager': 'Project Manager',
  manager: 'Manager',
  employee: 'Employee',
}

const statusMeta: Record<TaskStatus, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'blue' },
  'in-progress': { label: 'In Progress', tone: 'sky' },
  'in-review': { label: 'In Review', tone: 'gold' },
  done: { label: 'Done', tone: 'green' },
  blocked: { label: 'Blocked', tone: 'coral' },
}

const submissionMeta: Record<SubmissionStatus, { label: string; tone: string }> = {
  submitted: { label: 'Submitted', tone: 'gold' },
  approved: { label: 'Approved', tone: 'green' },
  returned: { label: 'Needs Revision', tone: 'coral' },
  removed: { label: 'Removed', tone: 'berry' },
}

const priorityRank: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

function uid(prefix: string) {
  if ('crypto' in window && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function nowIso() {
  return new Date().toISOString()
}

function toDateTimeInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function dateToDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  if (value.includes('T')) return value.slice(0, 16)
  return `${value.slice(0, 10)}T17:00`
}

function submissionDateToDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return toDateTimeInput()
  if (value.includes('T')) return value.slice(0, 16)
  return `${value.slice(0, 10)}T12:00`
}

function blankProject(): Project {
  const now = nowIso()
  return {
    id: uid('project'),
    name: '',
    businessUnit: '',
    description: '',
    teamName: '',
    deadlineAt: '',
    createdAt: now,
    updatedAt: now,
  }
}

function createPermissions(overrides: Partial<PermissionSet> = {}): PermissionSet {
  return { ...defaultEmployeePermissions, ...overrides }
}

function createMember(role: UserRole = 'employee', index = 0, managerId = ''): TeamMember {
  const isManager = role === 'manager'
  const isPM = role === 'project-manager'
  return {
    id: uid('member'),
    name: '',
    email: '',
    role,
    jobTitle: isPM ? roleDefaultTitle['project-manager'] : isManager ? roleDefaultTitle.manager : roleDefaultTitle.employee,
    strengths: '',
    availability: '',
    managerId,
    color: memberColors[index % memberColors.length],
    permissions: createPermissions({
      canViewEvidence: isPM || isManager,
      canViewHours: isPM || isManager,
      canEditTasks: isPM || isManager,
      canViewProjectContext: true,
    }),
  }
}

function createDeliverable(title = '', index = 0, dueAt = '', managerId = ''): Deliverable {
  const now = nowIso()
  return {
    id: uid('deliverable'),
    title,
    description: '',
    dueAt,
    status: 'not-started',
    color: deliverableColors[index % deliverableColors.length],
    assignedManagerId: managerId,
    createdAt: now,
    updatedAt: now,
  }
}

function blankTask(state: TrackFlowState, user?: TeamMember): TaskDraft {
  const managerDeliverable =
    user?.role === 'manager' ? state.deliverables.find((deliverable) => deliverable.assignedManagerId === user.id) : null
  const directReport = user?.role === 'manager' ? state.members.find((member) => member.managerId === user.id) : null
  return {
    title: '',
    description: '',
    deliverableId: managerDeliverable?.id ?? state.deliverables[0]?.id ?? '',
    ownerId: directReport?.id ?? user?.id ?? state.members[0]?.id ?? '',
    status: 'pending',
    priority: 'medium',
    dueAt: state.project.deadlineAt || toDateTimeInput(),
  }
}

function blankSubmission(state: TrackFlowState, userId = ''): SubmissionDraft {
  const task = state.tasks.find((item) => item.ownerId === userId && item.status !== 'done' && item.status !== 'in-review')
  return {
    taskId: task?.id ?? '',
    date: toDateTimeInput(),
    hours: '1',
    description: '',
  }
}

function parseRole(value: unknown, index: number): UserRole {
  if (value === 'project-manager' || value === 'manager' || value === 'employee') return value
  if (typeof value === 'string' && value.toLowerCase().includes('project')) return 'project-manager'
  if (typeof value === 'string' && value.toLowerCase().includes('manager')) return 'manager'
  return index === 0 ? 'project-manager' : 'employee'
}

function normalizeStatus(value: unknown): TaskStatus {
  if (value === 'done' || value === 'blocked' || value === 'in-progress' || value === 'in-review') return value
  return 'pending'
}

function normalizePriority(value: unknown): Priority {
  if (value === 'urgent' || value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function normalizeProject(input: Record<string, unknown> | undefined): Project {
  const now = nowIso()
  return {
    ...blankProject(),
    id: String(input?.id || uid('project')),
    name: String(input?.name || ''),
    businessUnit: String(input?.businessUnit || input?.course || ''),
    description: String(input?.description || ''),
    teamName: String(input?.teamName || ''),
    deadlineAt: dateToDateTime(input?.deadlineAt || input?.deadline),
    createdAt: String(input?.createdAt || now),
    updatedAt: String(input?.updatedAt || now),
  }
}

function normalizeMember(input: Record<string, unknown>, index: number): TeamMember {
  const role = parseRole(input.role, index)
  const permissions = typeof input.permissions === 'object' && input.permissions ? (input.permissions as Partial<PermissionSet>) : {}
  const rawJobTitle = String(input.jobTitle || '')
  const jobTitle = rawJobTitle && rawJobTitle !== 'Employee' ? rawJobTitle : roleDefaultTitle[role]
  return {
    ...createMember(role, index),
    id: String(input.id || uid('member')),
    name: String(input.name || ''),
    email: String(input.email || ''),
    role,
    jobTitle,
    strengths: String(input.strengths || ''),
    availability: String(input.availability || ''),
    managerId: String(input.managerId || ''),
    color: String(input.color || memberColors[index % memberColors.length]),
    permissions: createPermissions({
      canViewEvidence: role !== 'employee',
      canViewHours: role !== 'employee',
      canEditTasks: role !== 'employee',
      canViewProjectContext: true,
      ...permissions,
    }),
  }
}

function normalizeDeliverable(input: Record<string, unknown>, index: number, projectDeadline = ''): Deliverable {
  const status = input.status === 'complete' || input.status === 'in-progress' || input.status === 'in-review' ? input.status : 'not-started'
  const now = nowIso()
  return {
    ...createDeliverable('', index),
    id: String(input.id || uid('deliverable')),
    title: String(input.title || ''),
    description: String(input.description || ''),
    dueAt: dateToDateTime(input.dueAt || input.dueDate || projectDeadline),
    status,
    color: String(input.color || deliverableColors[index % deliverableColors.length]),
    assignedManagerId: String(input.assignedManagerId || ''),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  }
}

function normalizeTask(input: Record<string, unknown>, index: number, projectDeadline = ''): Task {
  const now = nowIso()
  return {
    id: String(input.id || uid('task')),
    title: String(input.title || `Task ${index + 1}`),
    description: String(input.description || ''),
    deliverableId: String(input.deliverableId || ''),
    ownerId: String(input.ownerId || ''),
    createdById: String(input.createdById || ''),
    status: normalizeStatus(input.status),
    priority: normalizePriority(input.priority),
    dueAt: dateToDateTime(input.dueAt || input.dueDate || projectDeadline),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  }
}

function parseHours(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
  const parsed = Number.parseFloat(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function normalizeSubmission(input: Record<string, unknown>, tasks: Task[]): TaskSubmission | null {
  const taskId = String(input.taskId || '')
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  const now = nowIso()
  const status =
    input.status === 'approved' || input.status === 'returned' || input.status === 'removed' || input.status === 'submitted'
      ? input.status
      : task.status === 'done'
        ? 'approved'
        : 'submitted'
  return {
    id: String(input.id || uid('submission')),
    memberId: String(input.memberId || task.ownerId),
    taskId,
    deliverableId: String(input.deliverableId || task.deliverableId),
    date: submissionDateToDateTime(input.date || input.createdAt),
    hours: parseHours(input.hours ?? input.effortEstimate),
    description: String(input.description || 'Legacy submission imported without a description.'),
    status,
    reviewNote: String(input.reviewNote || ''),
    reviewerId: String(input.reviewerId || ''),
    reviewedAt: String(input.reviewedAt || ''),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  }
}

function normalizeWorkLog(input: Record<string, unknown>): WorkLog {
  return {
    id: String(input.id || uid('worklog')),
    submissionId: String(input.submissionId || ''),
    memberId: String(input.memberId || ''),
    taskId: String(input.taskId || ''),
    deliverableId: String(input.deliverableId || ''),
    date: submissionDateToDateTime(input.date || input.createdAt),
    hours: parseHours(input.hours),
    description: String(input.description || ''),
    createdAt: String(input.createdAt || nowIso()),
  }
}

function normalizeVisibility(value: unknown, fallback: VisibilityScope): VisibilityScope {
  if (value === 'none' || value === 'own' || value === 'team') return value
  return fallback
}

function normalizeSettings(input: (Partial<Settings> & { employeesCanViewEvidence?: boolean; employeesCanViewHours?: boolean }) | undefined): Settings {
  const base = createSeedWorkspace().settings
  const legacyRecordVisibility = input?.employeesCanViewEvidence === true ? 'team' : base.employeeRecordVisibility
  const legacyHourVisibility = input?.employeesCanViewHours === true ? 'team' : base.employeeHourVisibility
  return {
    template: input?.template ?? base.template,
    calmLanguage: input?.calmLanguage ?? base.calmLanguage,
    supportiveCopy: input?.supportiveCopy ?? base.supportiveCopy,
    noSubmissionWindowDays: Number(input?.noSubmissionWindowDays ?? base.noSubmissionWindowDays),
    employeeRecordVisibility: normalizeVisibility(input?.employeeRecordVisibility, legacyRecordVisibility),
    employeeHourVisibility: normalizeVisibility(input?.employeeHourVisibility, legacyHourVisibility),
    employeesCanViewProjectContext: input?.employeesCanViewProjectContext ?? base.employeesCanViewProjectContext,
    managersCanEditDeliverables: input?.managersCanEditDeliverables ?? base.managersCanEditDeliverables,
    managersCanAddEmployees: input?.managersCanAddEmployees ?? base.managersCanAddEmployees,
    requireApprovalForCompletion: input?.requireApprovalForCompletion ?? base.requireApprovalForCompletion,
  }
}

function normalizeWorkspace(value: unknown): TrackFlowState {
  const base = createSeedWorkspace()
  if (!value || typeof value !== 'object') return base
  const candidate = value as Record<string, unknown>
  const project = normalizeProject(candidate.project as Record<string, unknown> | undefined)
  let members = Array.isArray(candidate.members) ? candidate.members.map((member, index) => normalizeMember(member as Record<string, unknown>, index)) : []
  if (members.length && !members.some((member) => member.role === 'project-manager')) members[0] = { ...members[0], role: 'project-manager', jobTitle: 'Project Manager' }
  const firstManager = members.find((member) => member.role === 'manager')
  if (members.length > 2 && !firstManager) members[1] = { ...members[1], role: 'manager', jobTitle: members[1].jobTitle || 'Team Manager' }
  const firstProjectManagerId = members.find((member) => member.role === 'project-manager')?.id ?? ''
  const managerId = members.find((member) => member.role === 'manager')?.id ?? ''
  const projectManagerIds = new Set(members.filter((member) => member.role === 'project-manager').map((member) => member.id))
  const managerIds = new Set(members.filter((member) => member.role === 'manager').map((member) => member.id))
  members = members.map((member) =>
    member.role === 'project-manager'
      ? { ...member, managerId: '' }
      : member.role === 'manager'
        ? { ...member, managerId: projectManagerIds.has(member.managerId) ? member.managerId : firstProjectManagerId }
        : { ...member, managerId: managerIds.has(member.managerId) ? member.managerId : managerId },
  )

  const deliverables = Array.isArray(candidate.deliverables)
    ? candidate.deliverables.map((deliverable, index) => normalizeDeliverable(deliverable as Record<string, unknown>, index, project.deadlineAt))
    : []
  const fallbackManager = members.find((member) => member.role === 'manager')?.id ?? ''
  const assignedDeliverables = deliverables.map((deliverable) =>
    !deliverable.assignedManagerId && fallbackManager ? { ...deliverable, assignedManagerId: fallbackManager } : deliverable,
  )
  const tasks = Array.isArray(candidate.tasks)
    ? candidate.tasks.map((task, index) => normalizeTask(task as Record<string, unknown>, index, project.deadlineAt))
    : []
  const rawSubmissions = Array.isArray(candidate.submissions)
    ? candidate.submissions
    : Array.isArray(candidate.contributions)
      ? candidate.contributions
      : []
  const submissions = rawSubmissions
    .map((entry) => normalizeSubmission(entry as Record<string, unknown>, tasks))
    .filter((entry): entry is TaskSubmission => Boolean(entry))
  const rawWorkLogs = Array.isArray(candidate.workLogs) ? candidate.workLogs : []
  const workLogs = rawWorkLogs.length
    ? rawWorkLogs.map((entry) => normalizeWorkLog(entry as Record<string, unknown>))
    : submissions.map((entry) => ({
        id: uid('worklog'),
        submissionId: entry.id,
        memberId: entry.memberId,
        taskId: entry.taskId,
        deliverableId: entry.deliverableId,
        date: entry.date,
        hours: entry.hours,
        description: entry.description,
        createdAt: entry.createdAt,
      }))

  return {
    project,
    members,
    deliverables: assignedDeliverables,
    tasks,
    submissions,
    workLogs,
    dismissedRiskIds: Array.isArray(candidate.dismissedRiskIds) ? candidate.dismissedRiskIds.map(String) : [],
    settings: normalizeSettings(candidate.settings as Partial<Settings> | undefined),
  }
}

function isWorkspace(value: unknown): value is TrackFlowState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TrackFlowState> & { contributions?: unknown[]; meetings?: unknown[] }
  return Boolean(
    candidate.project &&
      Array.isArray(candidate.members) &&
      Array.isArray(candidate.deliverables) &&
      Array.isArray(candidate.tasks) &&
      (Array.isArray(candidate.submissions) || Array.isArray(candidate.contributions)),
  )
}

function readBrowserWorkspace(): TrackFlowState {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return createSeedWorkspace()
  try {
    return normalizeWorkspace(JSON.parse(saved))
  } catch {
    return createSeedWorkspace()
  }
}

function hasProject(state: TrackFlowState) {
  return Boolean(state.project.name.trim())
}

function formatDateTime(value: string) {
  if (!value) return 'No date set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date set'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(value: string) {
  if (!value) return 'No date set'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  if (!value.includes('T')) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatHours(value: number) {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
  return `${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`
}

function hoursUntil(value: string) {
  if (!value) return null
  const target = new Date(value).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - Date.now()) / 3600000)
}

function memberName(members: TeamMember[], memberId?: string) {
  return members.find((member) => member.id === memberId)?.name || 'Unassigned'
}

function deliverableName(deliverables: Deliverable[], deliverableId?: string) {
  return deliverables.find((deliverable) => deliverable.id === deliverableId)?.title || 'General'
}

function taskName(tasks: Task[], taskId?: string) {
  return tasks.find((task) => task.id === taskId)?.title || 'Task not found'
}

function progressFor(tasks: Task[]) {
  if (!tasks.length) return 0
  return Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100)
}

function isOverdue(task: Task) {
  const hours = hoursUntil(task.dueAt)
  return task.status !== 'done' && hours !== null && hours < 0
}

function dueSoon(task: Task) {
  const hours = hoursUntil(task.dueAt)
  return task.status !== 'done' && hours !== null && hours >= 0 && hours <= 48
}

function isUrgentPending(task: Task) {
  return task.status !== 'done' && (task.status === 'blocked' || task.priority === 'urgent' || task.priority === 'high' || isOverdue(task) || dueSoon(task))
}

function sortTasks(tasks: Task[], sortMode: SortMode, members: TeamMember[]) {
  const next = [...tasks]
  next.sort((a, b) => {
    if (sortMode === 'priority') return priorityRank[b.priority] - priorityRank[a.priority]
    if (sortMode === 'owner') return memberName(members, a.ownerId).localeCompare(memberName(members, b.ownerId))
    if (sortMode === 'recent') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER
    return sortMode === 'due-desc' ? bTime - aTime : aTime - bTime
  })
  return next
}

function recordScopeFor(state: TrackFlowState, user: TeamMember | null): VisibilityScope {
  if (!user) return 'none'
  if (user.role === 'project-manager') return 'team'
  if (user.role === 'manager') return user.permissions.canViewEvidence ? 'team' : 'none'
  return user.permissions.canViewEvidence ? 'team' : state.settings.employeeRecordVisibility
}

function hourScopeFor(state: TrackFlowState, user: TeamMember | null): VisibilityScope {
  if (!user) return 'none'
  if (user.role === 'project-manager') return 'team'
  if (user.role === 'manager') return user.permissions.canViewHours ? 'team' : 'none'
  return user.permissions.canViewHours ? 'team' : state.settings.employeeHourVisibility
}

function userCanViewHours(state: TrackFlowState, user: TeamMember | null) {
  return hourScopeFor(state, user) !== 'none'
}

function userCanViewEvidence(state: TrackFlowState, user: TeamMember | null) {
  return recordScopeFor(state, user) !== 'none'
}

function userCanViewProjectContext(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return false
  return user.role !== 'employee' || state.settings.employeesCanViewProjectContext || user.permissions.canViewProjectContext
}

function directReportIds(state: TrackFlowState, managerId: string) {
  return new Set(state.members.filter((member) => member.managerId === managerId).map((member) => member.id))
}

function reportOptionsForRole(state: TrackFlowState, role: UserRole, selfId = '') {
  if (role === 'manager') return state.members.filter((member) => member.role === 'project-manager' && member.id !== selfId)
  if (role === 'employee') return state.members.filter((member) => member.role === 'manager' && member.id !== selfId)
  return []
}

function setupReportOptions(members: TeamMember[], role: UserRole, selfId = '') {
  if (role === 'manager') return members.filter((member) => member.role === 'project-manager' && member.id !== selfId)
  if (role === 'employee') return members.filter((member) => member.role === 'manager' && member.id !== selfId)
  return []
}

function validManagerIdForRole(options: TeamMember[], currentId: string) {
  return options.some((member) => member.id === currentId) ? currentId : options[0]?.id ?? ''
}

function visibleMembersFor(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  return state.members
}

function visibleDeliverablesFor(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  return state.deliverables
}

function visibleTasksFor(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  return state.tasks
}

function visibleSubmissionsFor(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  if (user.role === 'project-manager') return state.submissions
  if (user.role === 'manager') {
    if (!user.permissions.canViewEvidence) return []
    const reports = directReportIds(state, user.id)
    const deliverables = new Set(state.deliverables.filter((deliverable) => deliverable.assignedManagerId === user.id).map((deliverable) => deliverable.id))
    return state.submissions.filter((entry) => entry.memberId === user.id || reports.has(entry.memberId) || deliverables.has(entry.deliverableId))
  }
  const scope = recordScopeFor(state, user)
  if (scope === 'team') return state.submissions
  if (scope === 'own') return state.submissions.filter((entry) => entry.memberId === user.id)
  return []
}

function canCreateTasks(user: TeamMember | null) {
  if (!user) return false
  if (user.role === 'project-manager') return true
  if (user.role === 'manager') return user.permissions.canEditTasks
  return user.permissions.canEditTasks
}

function canEditDeliverable(state: TrackFlowState, user: TeamMember | null, deliverable: Deliverable) {
  if (!user) return false
  if (user.role === 'project-manager') return true
  return user.role === 'manager' && user.permissions.canEditTasks && state.settings.managersCanEditDeliverables && deliverable.assignedManagerId === user.id
}

function canReviewSubmission(state: TrackFlowState, user: TeamMember | null, submission: TaskSubmission) {
  if (!user || user.role === 'employee') return false
  if (user.role === 'project-manager') return true
  if (!user.permissions.canViewEvidence) return false
  const reports = directReportIds(state, user.id)
  return reports.has(submission.memberId) || state.deliverables.some((deliverable) => deliverable.id === submission.deliverableId && deliverable.assignedManagerId === user.id)
}

function scopedOwnersForTask(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  if (user.role === 'project-manager') return state.members
  if (user.role === 'manager') return state.members.filter((member) => member.id === user.id || member.managerId === user.id)
  return state.members.filter((member) => member.id === user.id)
}

function scopedDeliverablesForTask(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  if (user.role === 'project-manager') return state.deliverables
  if (user.role === 'manager') return state.deliverables.filter((deliverable) => deliverable.assignedManagerId === user.id)
  return visibleDeliverablesFor(state, user)
}

function hoursForMember(state: TrackFlowState, memberId: string) {
  return state.workLogs.filter((entry) => entry.memberId === memberId).reduce((total, entry) => total + entry.hours, 0)
}

function hoursForTask(state: TrackFlowState, taskId: string) {
  return state.workLogs.filter((entry) => entry.taskId === taskId).reduce((total, entry) => total + entry.hours, 0)
}

function visibleWorkLogsFor(state: TrackFlowState, user: TeamMember | null) {
  if (!user) return []
  if (user.role === 'project-manager') return state.workLogs
  if (user.role === 'manager') {
    if (!user.permissions.canViewHours) return []
    const reports = directReportIds(state, user.id)
    const deliverables = new Set(state.deliverables.filter((deliverable) => deliverable.assignedManagerId === user.id).map((deliverable) => deliverable.id))
    return state.workLogs.filter((entry) => entry.memberId === user.id || reports.has(entry.memberId) || deliverables.has(entry.deliverableId))
  }
  const scope = hourScopeFor(state, user)
  if (scope === 'team') return state.workLogs
  if (scope === 'own') return state.workLogs.filter((entry) => entry.memberId === user.id)
  return []
}

function hourMembersFor(state: TrackFlowState, user: TeamMember | null, fallbackMembers: TeamMember[]) {
  if (!user) return []
  if (user.role === 'project-manager') return fallbackMembers
  if (user.role === 'manager') return user.permissions.canViewHours ? fallbackMembers.filter((member) => member.id === user.id || member.managerId === user.id) : []
  const scope = hourScopeFor(state, user)
  if (scope === 'team') return state.members
  if (scope === 'own') return state.members.filter((member) => member.id === user.id)
  return []
}

function managerIdForTask(state: TrackFlowState, task: Task) {
  const owner = state.members.find((member) => member.id === task.ownerId)
  if (owner?.role === 'manager') return owner.id
  if (owner?.managerId) return owner.managerId
  return state.deliverables.find((deliverable) => deliverable.id === task.deliverableId)?.assignedManagerId ?? ''
}

function managerNameForTask(state: TrackFlowState, task: Task) {
  const managerId = managerIdForTask(state, task)
  return managerId ? memberName(state.members, managerId) : 'No manager'
}

function taskMatchesManager(state: TrackFlowState, task: Task, managerId: string) {
  if (managerId === 'all') return true
  const owner = state.members.find((member) => member.id === task.ownerId)
  const deliverable = state.deliverables.find((item) => item.id === task.deliverableId)
  return owner?.id === managerId || owner?.managerId === managerId || deliverable?.assignedManagerId === managerId
}

function tasksForMember(state: TrackFlowState, memberId: string) {
  return state.tasks.filter((task) => task.ownerId === memberId)
}

function tasksForManagerTeam(state: TrackFlowState, managerId: string) {
  return state.tasks.filter((task) => taskMatchesManager(state, task, managerId))
}

function canAccessView(state: TrackFlowState, user: TeamMember | null, itemId: View) {
  if (!user) return false
  if (itemId === 'deliverables') return user.role !== 'employee' || userCanViewProjectContext(state, user)
  if (itemId === 'evidence') return userCanViewEvidence(state, user)
  if (itemId === 'report' || itemId === 'risks') return user.role !== 'employee'
  if (itemId === 'settings') return user.role === 'project-manager'
  return true
}

function canEditMemberProfile(actor: TeamMember | null, member: TeamMember) {
  if (!actor) return false
  if (actor.role === 'project-manager') return true
  return actor.role === 'manager' && (member.id === actor.id || (member.role === 'employee' && member.managerId === actor.id))
}

function canEditMemberStructure(actor: TeamMember | null) {
  return actor?.role === 'project-manager'
}

function canEditMemberPermission(actor: TeamMember | null, member: TeamMember, key: keyof PermissionSet) {
  if (!actor) return false
  if (actor.role === 'project-manager') return true
  return actor.role === 'manager' && member.role === 'employee' && member.managerId === actor.id && (key === 'canEditTasks' || key === 'canViewProjectContext')
}

function createRiskFlags(state: TrackFlowState): RiskFlag[] {
  const risks: RiskFlag[] = []
  const windowDays = Math.max(1, state.settings.noSubmissionWindowDays || 7)
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - windowDays)
  const recentlyLogged = new Set(
    state.workLogs.filter((entry) => new Date(`${entry.date}T12:00:00`) >= cutoff).map((entry) => entry.memberId),
  )

  state.tasks
    .filter((task) => task.status !== 'done')
    .forEach((task) => {
      if (isOverdue(task)) {
        risks.push({
          id: `overdue-${task.id}`,
          type: 'Overdue work',
          severity: 'high',
          message: `${task.title} is past its due date. Confirm ownership, unblock, or adjust scope.`,
          relatedTaskId: task.id,
        })
      } else if (dueSoon(task)) {
        risks.push({
          id: `due-${task.id}`,
          type: 'Due in 48h',
          severity: 'medium',
          message: `${task.title} is due soon. Check whether the owner needs support.`,
          relatedTaskId: task.id,
        })
      }
      if (!task.ownerId) {
        risks.push({
          id: `owner-${task.id}`,
          type: 'No owner',
          severity: 'high',
          message: `${task.title} needs a clear owner before work can move forward.`,
          relatedTaskId: task.id,
        })
      }
      if (task.status === 'blocked') {
        risks.push({
          id: `blocked-${task.id}`,
          type: 'Blocked',
          severity: 'high',
          message: `${task.title} is blocked. Capture the blocker and decide the next action.`,
          relatedTaskId: task.id,
        })
      }
      if (task.status === 'in-review') {
        risks.push({
          id: `review-${task.id}`,
          type: 'Waiting for review',
          severity: 'medium',
          message: `${task.title} has a submission waiting for manager review.`,
          relatedTaskId: task.id,
        })
      }
    })

  state.deliverables.forEach((deliverable) => {
    if (!deliverable.assignedManagerId) {
      risks.push({
        id: `deliverable-manager-${deliverable.id}`,
        type: 'No manager assigned',
        severity: 'high',
        message: `${deliverable.title} needs an accountable manager.`,
        relatedDeliverableId: deliverable.id,
      })
    }
    if (!state.tasks.some((task) => task.deliverableId === deliverable.id)) {
      risks.push({
        id: `deliverable-tasks-${deliverable.id}`,
        type: 'No tasks attached',
        severity: 'medium',
        message: `${deliverable.title} has no employee tasks attached yet.`,
        relatedDeliverableId: deliverable.id,
      })
    }
  })

  state.members
    .filter((member) => member.role === 'employee' && state.tasks.some((task) => task.ownerId === member.id))
    .forEach((member) => {
      if (!recentlyLogged.has(member.id)) {
        risks.push({
          id: `member-${member.id}`,
          type: 'No recent submission',
          severity: 'low',
          message: `${member.name || 'An employee'} has no work hours logged in the last ${windowDays} days.`,
          relatedMemberId: member.id,
        })
      }
    })

  return risks.filter((risk) => !state.dismissedRiskIds.includes(risk.id))
}

function makeSetupDraft(state: TrackFlowState): SetupDraft {
  const hasExisting = hasProject(state) || state.members.length || state.deliverables.length
  return {
    project: hasExisting ? { ...state.project } : blankProject(),
    template: state.settings.template || 'Blank corporate workspace',
    deliverables: state.deliverables.map((deliverable) => ({ ...deliverable })),
    members: hasExisting
      ? state.members.map((member) => ({ ...member, permissions: { ...member.permissions } }))
      : [{ ...createMember('project-manager', 0), name: 'Project Manager' }],
  }
}

function textareaRows(value: string, min = 3) {
  return Math.max(min, value.split('\n').length + 2, Math.ceil(value.length / 90))
}

function App() {
  const [state, setState] = useState<TrackFlowState>(() => createSeedWorkspace())
  const [activeUserId, setActiveUserId] = useState('')
  const [view, setView] = useState<View>('dashboard')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [notice, setNotice] = useState('')
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(() => makeSetupDraft(createSeedWorkspace()))
  const [setupStep, setSetupStep] = useState(0)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingMemberId, setEditingMemberId] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => blankTask(createSeedWorkspace()))
  const [memberDraft, setMemberDraft] = useState<TeamMember>(() => createMember('employee', 0))
  const [submissionDraft, setSubmissionDraft] = useState<SubmissionDraft>(() => blankSubmission(createSeedWorkspace()))
  const [filters, setFilters] = useState({ owner: 'all', manager: 'all', deliverable: 'all', priority: 'all', search: '' })
  const [panelSorts, setPanelSorts] = useState<Record<'urgent' | 'pending' | 'done', SortMode>>({
    urgent: 'due-asc',
    pending: 'due-asc',
    done: 'recent',
  })
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('')
  const [reportText, setReportText] = useState('')
  const [hasHydrated, setHasHydrated] = useState(false)
  const deferredSearch = useDeferredValue(filters.search)

  const currentUser =
    state.members.find((member) => member.id === activeUserId) ||
    (activeUserId === 'setup-admin' ? ({ ...createMember('project-manager', 0), id: 'setup-admin', name: 'Setup Project Manager' } as TeamMember) : null)
  const activeView: View = currentUser && canAccessView(state, currentUser, view) ? view : 'dashboard'

  const visibleMembers = visibleMembersFor(state, currentUser)
  const visibleDeliverables = visibleDeliverablesFor(state, currentUser)
  const visibleTasks = visibleTasksFor(state, currentUser)
  const visibleSubmissions = visibleSubmissionsFor(state, currentUser)
  const selectedMember = state.members.find((member) => member.id === selectedMemberId) ?? null
  const risks = createRiskFlags(state)
  const canViewHours = userCanViewHours(state, currentUser)
  const canViewEvidence = userCanViewEvidence(state, currentUser)
  const visibleWorkLogs = visibleWorkLogsFor(state, currentUser)
  const visibleHourMembers = hourMembersFor(state, currentUser, visibleMembers)
  const canSubmitWork = Boolean(
    currentUser && state.tasks.some((task) => task.ownerId === currentUser.id && task.status !== 'done' && task.status !== 'in-review'),
  )
  const visibleHours = visibleWorkLogs.reduce((total, entry) => total + entry.hours, 0)

  useEffect(() => {
    let cancelled = false
    loadWorkspaceFromApi()
      .then((response) => {
        if (cancelled) return
        const workspace = response.workspace ? normalizeWorkspace(response.workspace) : readBrowserWorkspace()
        setState(workspace)
        setStorageInfo(response.storage)
        setSyncStatus(response.loadedFromFile ? 'saved' : 'offline')
        setSetupDraft(makeSetupDraft(workspace))
        setSubmissionDraft(blankSubmission(workspace))
        setHasHydrated(true)
      })
      .catch(() => {
        if (cancelled) return
        const workspace = readBrowserWorkspace()
        setState(workspace)
        setSyncStatus('offline')
        setSetupDraft(makeSetupDraft(workspace))
        setHasHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const timer = window.setTimeout(() => {
      setSyncStatus('saving')
      saveWorkspaceToApi(state)
        .then((response) => {
          setStorageInfo(response.storage)
          setSyncStatus('saved')
        })
        .catch(() => {
          setSyncStatus('offline')
        })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [hasHydrated, state])

  useEffect(() => {
    const timer = window.setTimeout(() => setReportText(buildReport(state, risks)), 0)
    return () => window.clearTimeout(timer)
  }, [state, risks])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  function selectUser(userId: string) {
    setActiveUserId(userId)
    setView('dashboard')
    setSelectedMemberId('')
    setEditingMemberId('')
    setSubmissionDraft(blankSubmission(state, userId))
  }

  function updateProjectSetup<K extends keyof Project>(key: K, value: Project[K]) {
    setSetupDraft((draft) => ({ ...draft, project: { ...draft.project, [key]: value } }))
  }

  function updateSetupMember(id: string, updates: Partial<TeamMember>) {
    setSetupDraft((draft) => ({
      ...draft,
      members: draft.members.map((member) => (member.id === id ? { ...member, ...updates } : member)),
    }))
  }

  function updateSetupDeliverable(id: string, updates: Partial<Deliverable>) {
    setSetupDraft((draft) => ({
      ...draft,
      deliverables: draft.deliverables.map((deliverable) => (deliverable.id === id ? { ...deliverable, ...updates } : deliverable)),
    }))
  }

  function applyTemplate(name: string) {
    const template = templateCatalog.find((item) => item.name === name) ?? templateCatalog[0]
    setSetupDraft((draft) => ({
      ...draft,
      template: name,
      deliverables: template.deliverables.map((title, index) => createDeliverable(title, index, draft.project.deadlineAt)),
    }))
  }

  function openSetupModal() {
    setSetupDraft(makeSetupDraft(state))
    setSetupStep(0)
    setShowSetupModal(true)
  }

  function saveSetup(event: FormEvent) {
    event.preventDefault()
    const cleanMembers = setupDraft.members
      .filter((member) => member.name.trim() || member.email.trim() || member.jobTitle.trim())
      .map((member, index) => ({ ...member, name: member.name.trim() || `${roleMeta[member.role].label} ${index + 1}` }))
    const members = cleanMembers.length ? cleanMembers : [{ ...createMember('project-manager', 0), name: 'Project Manager' }]
    if (!members.some((member) => member.role === 'project-manager')) members[0] = { ...members[0], role: 'project-manager', jobTitle: 'Project Manager' }
    const projectManagerIds = new Set(members.filter((member) => member.role === 'project-manager').map((member) => member.id))
    const managerIds = new Set(members.filter((member) => member.role === 'manager').map((member) => member.id))
    const normalizedMembers = members.map((member) =>
      member.role === 'project-manager'
        ? { ...member, managerId: '', jobTitle: member.jobTitle || roleDefaultTitle['project-manager'] }
        : member.role === 'manager'
          ? { ...member, managerId: projectManagerIds.has(member.managerId) ? member.managerId : '', jobTitle: member.jobTitle || roleDefaultTitle.manager }
          : { ...member, managerId: managerIds.has(member.managerId) ? member.managerId : '', jobTitle: member.jobTitle || roleDefaultTitle.employee },
    )
    const deliverables = setupDraft.deliverables.filter((deliverable) => deliverable.title.trim())
    const now = nowIso()
    const next = {
      ...state,
      project: {
        ...setupDraft.project,
        name: setupDraft.project.name.trim() || 'Untitled Corporate Project',
        updatedAt: now,
      },
      members: normalizedMembers,
      deliverables,
      settings: { ...state.settings, template: setupDraft.template },
    }
    setState(next)
    if (activeUserId === 'setup-admin' || !normalizedMembers.some((member) => member.id === activeUserId)) {
      const nextUserId = normalizedMembers.find((member) => member.role === 'project-manager')?.id ?? normalizedMembers[0]?.id ?? ''
      setActiveUserId(nextUserId)
      setSubmissionDraft(blankSubmission(next, nextUserId))
    }
    setShowSetupModal(false)
    setNotice('Project workspace updated.')
  }

  function addDeliverable() {
    const manager = state.members.find((member) => member.role === 'manager')
    setState((current) => ({
      ...current,
      deliverables: [createDeliverable('', current.deliverables.length, current.project.deadlineAt, manager?.id ?? ''), ...current.deliverables],
    }))
  }

  function updateDeliverable(id: string, updates: Partial<Deliverable>) {
    setState((current) => ({
      ...current,
      deliverables: current.deliverables.map((deliverable) =>
        deliverable.id === id ? { ...deliverable, ...updates, updatedAt: nowIso() } : deliverable,
      ),
    }))
  }

  function deleteDeliverable(id: string) {
    if (!window.confirm('Delete this deliverable and its linked tasks? Logged hours will remain in the historical ledger.')) return
    setState((current) => ({
      ...current,
      deliverables: current.deliverables.filter((deliverable) => deliverable.id !== id),
      tasks: current.tasks.filter((task) => task.deliverableId !== id),
    }))
  }

  function openNewTask() {
    setEditingTaskId(null)
    setTaskDraft(blankTask(state, currentUser ?? undefined))
    setShowTaskModal(true)
  }

  function openMemberModal() {
    const role: UserRole = currentUser?.role === 'manager' ? 'employee' : 'employee'
    const reportOptions = currentUser?.role === 'manager' && currentUser ? [currentUser] : reportOptionsForRole(state, role)
    setMemberDraft(createMember(role, state.members.length, validManagerIdForRole(reportOptions, '')))
    setShowMemberModal(true)
  }

  function closeMemberModal() {
    setShowMemberModal(false)
    setMemberDraft(createMember('employee', state.members.length + 1, currentUser?.role === 'manager' ? currentUser.id : ''))
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id)
    setTaskDraft({
      title: task.title,
      description: task.description,
      deliverableId: task.deliverableId,
      ownerId: task.ownerId,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
    })
    setShowTaskModal(true)
  }

  function saveTask(event: FormEvent) {
    event.preventDefault()
    if (!taskDraft.title.trim()) {
      setNotice('Task title is required.')
      return
    }
    if (!taskDraft.ownerId || !taskDraft.deliverableId) {
      setNotice('Every task needs an owner and deliverable.')
      return
    }
    const now = nowIso()
    setState((current) => {
      if (editingTaskId) {
        return {
          ...current,
          tasks: current.tasks.map((task) => (task.id === editingTaskId ? { ...task, ...taskDraft, updatedAt: now } : task)),
        }
      }
      const task: Task = {
        ...taskDraft,
        id: uid('task'),
        createdById: currentUser?.id ?? '',
        createdAt: now,
        updatedAt: now,
      }
      return { ...current, tasks: [task, ...current.tasks] }
    })
    setShowTaskModal(false)
    setNotice(editingTaskId ? 'Task updated.' : 'Task created at the top of the board.')
  }

  function deleteTask(id: string) {
    if (!window.confirm('Delete this task? Submission and hours records stay available for managers.')) return
    setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }))
  }

  function addMember(event: FormEvent) {
    event.preventDefault()
    if (!memberDraft.name.trim()) {
      setNotice('Team member name is required.')
      return
    }
    const role = currentUser?.role === 'manager' ? 'employee' : memberDraft.role
    const reportOptions = reportOptionsForRole(state, role)
    const managerId = currentUser?.role === 'manager' ? currentUser.id : validManagerIdForRole(reportOptions, memberDraft.managerId)
    const nextMember: TeamMember = {
      ...memberDraft,
      id: uid('member'),
      role,
      managerId,
      name: memberDraft.name.trim(),
      jobTitle: memberDraft.jobTitle && memberDraft.jobTitle !== roleDefaultTitle[memberDraft.role] ? memberDraft.jobTitle : roleDefaultTitle[role],
      permissions: createPermissions({
        ...memberDraft.permissions,
        canViewEvidence: role === 'project-manager' || memberDraft.permissions.canViewEvidence,
        canViewHours: role === 'project-manager' || memberDraft.permissions.canViewHours,
        canEditTasks: role === 'project-manager' || memberDraft.permissions.canEditTasks,
        canViewProjectContext: role === 'project-manager' || memberDraft.permissions.canViewProjectContext,
      }),
    }
    setState((current) => ({ ...current, members: [nextMember, ...current.members] }))
    setMemberDraft(createMember('employee', state.members.length + 1, currentUser?.role === 'manager' ? currentUser.id : ''))
    setShowMemberModal(false)
    setSelectedMemberId(nextMember.id)
    setNotice('Team member added at the top of the list.')
  }

  function updateMember(id: string, updates: Partial<TeamMember>) {
    setState((current) => ({
      ...current,
      members: current.members.map((member) => (member.id === id ? { ...member, ...updates } : member)),
    }))
  }

  function changeMemberRole(member: TeamMember, role: UserRole) {
    const reportOptions = reportOptionsForRole(state, role, member.id)
    const defaultPermissions = createMember(role).permissions
    updateMember(member.id, {
      role,
      managerId: validManagerIdForRole(reportOptions, member.managerId),
      jobTitle: !member.jobTitle || member.jobTitle === roleDefaultTitle[member.role] ? roleDefaultTitle[role] : member.jobTitle,
      permissions: createPermissions(role === member.role ? member.permissions : defaultPermissions),
    })
  }

  function updateMemberPermission(id: string, key: keyof PermissionSet, value: boolean) {
    setState((current) => ({
      ...current,
      members: current.members.map((member) =>
        member.id === id ? { ...member, permissions: { ...member.permissions, [key]: value } } : member,
      ),
    }))
  }

  function deleteMember(id: string) {
    if (!window.confirm('Remove this team member from the workspace? Their historical submissions and hours stay in the records.')) return
    setState((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== id),
      tasks: current.tasks.map((task) => (task.ownerId === id ? { ...task, ownerId: '', updatedAt: nowIso() } : task)),
      deliverables: current.deliverables.map((deliverable) =>
        deliverable.assignedManagerId === id ? { ...deliverable, assignedManagerId: '', updatedAt: nowIso() } : deliverable,
      ),
    }))
  }

  function selectMember(memberId: string) {
    const member = state.members.find((item) => item.id === memberId)
    if (member?.role === 'manager') setFilters((current) => ({ ...current, owner: 'all', manager: member.id, deliverable: 'all' }))
    if (member?.role === 'employee') setFilters((current) => ({ ...current, owner: member.id, manager: 'all', deliverable: 'all' }))
    if (member?.role === 'project-manager') setFilters((current) => ({ ...current, owner: 'all', manager: 'all', deliverable: 'all' }))
    setSelectedMemberId(memberId)
    setEditingMemberId('')
  }

  function focusTasksForMember(member: TeamMember) {
    setFilters((current) => ({ ...current, owner: member.id, manager: 'all', deliverable: 'all' }))
    setView('tasks')
  }

  function focusTasksForManager(member: TeamMember) {
    setFilters((current) => ({ ...current, owner: 'all', manager: member.id, deliverable: 'all' }))
    setView('tasks')
  }

  function submitWork(event: FormEvent) {
    event.preventDefault()
    if (!currentUser) return
    const task = state.tasks.find((item) => item.id === submissionDraft.taskId)
    if (!task || task.ownerId !== currentUser.id) {
      setNotice('Submissions must be tied to one of your own assigned tasks.')
      return
    }
    const hours = parseHours(submissionDraft.hours)
    if (!hours || hours <= 0) {
      setNotice('Please enter hours greater than 0.')
      return
    }
    if (!submissionDraft.description.trim()) {
      setNotice('A task submission description is required.')
      return
    }
    const now = nowIso()
    const status: SubmissionStatus = state.settings.requireApprovalForCompletion ? 'submitted' : 'approved'
    const submission: TaskSubmission = {
      id: uid('submission'),
      memberId: currentUser.id,
      taskId: task.id,
      deliverableId: task.deliverableId,
      date: submissionDraft.date || toDateTimeInput(),
      hours,
      description: submissionDraft.description.trim(),
      status,
      reviewNote: '',
      reviewerId: state.settings.requireApprovalForCompletion ? '' : currentUser.id,
      reviewedAt: state.settings.requireApprovalForCompletion ? '' : now,
      createdAt: now,
      updatedAt: now,
    }
    const workLog: WorkLog = {
      id: uid('worklog'),
      submissionId: submission.id,
      memberId: currentUser.id,
      taskId: task.id,
      deliverableId: task.deliverableId,
      date: submission.date,
      hours,
      description: submission.description,
      createdAt: now,
    }
    setState((current) => ({
      ...current,
      submissions: [submission, ...current.submissions],
      workLogs: [workLog, ...current.workLogs],
      tasks: current.tasks.map((item) =>
        item.id === task.id ? { ...item, status: status === 'approved' ? 'done' : 'in-review', updatedAt: now } : item,
      ),
    }))
    setSubmissionDraft({ taskId: '', date: toDateTimeInput(), hours: '1', description: '' })
    setNotice(state.settings.requireApprovalForCompletion ? 'Submitted for manager review. Hours are logged.' : 'Task completed and hours logged.')
  }

  function reviewSubmission(submissionId: string, status: SubmissionStatus) {
    const submission = state.submissions.find((entry) => entry.id === submissionId)
    if (!submission || !canReviewSubmission(state, currentUser, submission)) return
    const note =
      status === 'approved'
        ? ''
        : window.prompt(status === 'removed' ? 'Why should this submission be removed from active evidence?' : 'What revision is needed?', '') || ''
    const now = nowIso()
    setState((current) => ({
      ...current,
      submissions: current.submissions.map((entry) =>
        entry.id === submissionId
          ? {
              ...entry,
              status,
              reviewNote: note,
              reviewerId: currentUser?.id ?? '',
              reviewedAt: now,
              updatedAt: now,
            }
          : entry,
      ),
      tasks: current.tasks.map((task) => {
        if (task.id !== submission.taskId) return task
        if (status === 'approved') return { ...task, status: 'done', updatedAt: now }
        return { ...task, status: 'pending', updatedAt: now }
      }),
    }))
    setNotice(status === 'approved' ? 'Submission approved and task marked done.' : 'Submission returned and task reopened. Logged hours were preserved.')
  }

  function updateSettings(updates: Partial<Settings>) {
    setState((current) => ({ ...current, settings: { ...current.settings, ...updates } }))
  }

  function filteredTasksForPanel(panel: 'urgent' | 'pending' | 'done') {
    const search = deferredSearch.trim().toLowerCase()
    const filtered = visibleTasks.filter((task) => {
      const matchesPanel =
        panel === 'done' ? task.status === 'done' : panel === 'urgent' ? isUrgentPending(task) : task.status !== 'done' && !isUrgentPending(task)
      if (!matchesPanel) return false
      if (filters.owner !== 'all' && task.ownerId !== filters.owner) return false
      if (filters.manager !== 'all' && !taskMatchesManager(state, task, filters.manager)) return false
      if (filters.deliverable !== 'all' && task.deliverableId !== filters.deliverable) return false
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false
      if (!search) return true
      return `${task.title} ${task.description} ${memberName(state.members, task.ownerId)} ${managerNameForTask(state, task)} ${deliverableName(state.deliverables, task.deliverableId)}`
        .toLowerCase()
        .includes(search)
    })
    return sortTasks(filtered, panelSorts[panel], state.members)
  }

  async function exportBackup() {
    try {
      const response = await saveBackupToApi(state)
      setStorageInfo(response.storage)
      setNotice(`Backup saved: ${response.backupPath}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backup failed.')
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      if (!isWorkspace(parsed)) throw new Error('That file does not look like a TrackFlow workspace.')
      const workspace = normalizeWorkspace(parsed)
      const response = await importWorkspaceToApi(workspace)
      setState(normalizeWorkspace(response.workspace ?? workspace))
      setStorageInfo(response.storage)
      setNotice('Workspace imported successfully.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      event.target.value = ''
    }
  }

  async function saveReport() {
    try {
      const response = await saveReportToApi(reportText)
      setStorageInfo(response.storage)
      setNotice(`Report saved: ${response.reportPath}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Report save failed.')
    }
  }

  async function copyReport() {
    await navigator.clipboard.writeText(reportText)
    setNotice('Report copied to clipboard.')
  }

  function resetWorkspace() {
    if (!window.confirm('Start a blank corporate workspace? This replaces the current active workspace file. Export a backup first if needed.')) return
    const blank = createSeedWorkspace()
    setState(blank)
    setActiveUserId('')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blank))
    setSetupDraft(makeSetupDraft(blank))
    setView('dashboard')
    setNotice('Blank corporate workspace ready.')
  }

  function accessibleNavItems() {
    return navItems.filter((item) => canAccessView(state, currentUser, item.id))
  }

  function renderLogin() {
    return (
      <div className="login-shell">
        <div className="login-panel">
          <div className="brand login-brand">
            <span className="trackflow-wordmark login-wordmark" aria-label="TrackFlow" />
          </div>
          <div>
            <h1>Choose your workspace identity</h1>
          </div>
          <div className="login-list">
            {state.members.map((member) => (
              <button key={member.id} className="login-card" type="button" onClick={() => selectUser(member.id)}>
                <span className="avatar" style={{ '--member-color': member.color } as CSSProperties}>
                  {member.name.slice(0, 1).toUpperCase() || '?'}
                </span>
                <span>
                  <strong>{member.name || 'Unnamed user'}</strong>
                  <small>{memberSubtitle(member)}</small>
                </span>
              </button>
            ))}
            {!state.members.length && (
              <button className="login-card primary-login" type="button" onClick={() => selectUser('setup-admin')}>
                <span className="avatar">PM</span>
                <span>
                  <strong>Start setup as Project Manager</strong>
                  <small>Create the first project, managers, employees, and permissions.</small>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderDashboard() {
    const tasks = visibleTasks
    const completed = tasks.filter((task) => task.status === 'done').length
    const urgent = tasks.filter(isUrgentPending).length
    const reviews = visibleSubmissions.filter((entry) => entry.status === 'submitted').length
    const upcoming = tasks
      .filter((task) => task.status !== 'done' && task.dueAt)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 5)
    const recent = visibleSubmissions.slice(0, 5)

    return (
      <section className="page-stack">
        <div className="hero-grid">
          <div className="hero-card">
            <div className="hero-copy">
              <span className="eyebrow">{currentUser ? roleMeta[currentUser.role].label : 'Workspace'}</span>
              <h2>{hasProject(state) ? state.project.name : 'Create your corporate project control room'}</h2>
              <p>{hasProject(state) ? state.project.description || 'No description added yet.' : 'Set up the project, managers, deliverables, employees, and role permissions in one guided modal.'}</p>
            </div>
            <div className="hero-actions">
              {(currentUser?.role === 'project-manager' || activeUserId === 'setup-admin') && (
                <button className="primary-btn" type="button" onClick={openSetupModal}>
                  {hasProject(state) ? 'Edit Project Setup' : 'Create Project'}
                </button>
              )}
              {canCreateTasks(currentUser) && (
                <button className="secondary-btn" type="button" onClick={openNewTask}>
                  Add Task
                </button>
              )}
            </div>
          </div>
          <div className="progress-orb">
            <span>{progressFor(tasks)}%</span>
            <small>visible task completion</small>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard label="Visible Tasks" value={tasks.length} helper={`${completed} done`} tone="blue" />
          <MetricCard label="Urgent Pending" value={urgent} helper="overdue, due soon, high priority, or blocked" tone="red" />
          <MetricCard label="Pending Reviews" value={reviews} helper="submissions waiting for action" tone="gold" />
          <MetricCard label="Visible Hours" value={canViewHours ? formatHours(visibleHours) : 'Locked'} helper={canViewHours ? hourVisibilityLabel(hourScopeFor(state, currentUser)) : 'manager controlled'} tone="green" />
        </div>

        <div className="split-grid">
          <Card title="Upcoming Deadlines" action={<button type="button" onClick={() => setView('tasks')}>Open tasks</button>}>
            <div className="list-stack">
              {upcoming.length ? (
                upcoming.map((task) => (
                  <div key={task.id} className="timeline-row">
                    <span className={`status-dot ${isUrgentPending(task) ? 'danger' : ''}`} />
                    <div>
                      <strong>{task.title}</strong>
                      <small>{formatDateTime(task.dueAt)} - {memberName(state.members, task.ownerId)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No upcoming tasks" copy="Once work is assigned, deadlines will appear here." />
              )}
            </div>
          </Card>

          <Card title="Recent Task Submissions" action={<button type="button" onClick={() => setView('submissions')}>Open submissions</button>}>
            <div className="list-stack">
              {recent.length ? (
                recent.map((entry) => (
                  <div key={entry.id} className="submission-row">
                    <Badge tone={submissionMeta[entry.status].tone}>{submissionMeta[entry.status].label}</Badge>
                    <div>
                      <strong>{taskName(state.tasks, entry.taskId)}</strong>
                      <small>{memberName(state.members, entry.memberId)} - {formatDate(entry.date)} - {canViewHours ? formatHours(entry.hours) : 'hours hidden'}</small>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No submissions yet" copy="Employees submit task work here when their assigned tasks are ready for review." />
              )}
            </div>
          </Card>
        </div>
      </section>
    )
  }

  function renderDeliverables() {
    const managers = state.members.filter((member) => member.role === 'manager')
    const canAdd = currentUser?.role === 'project-manager'
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Project managers assign deliverables to managers. Description boxes expand with their content.</p>
          </div>
          {canAdd && <button className="primary-btn" type="button" onClick={addDeliverable}>Add Deliverable</button>}
        </div>
        <div className="deliverable-list">
          {visibleDeliverables.length ? (
            visibleDeliverables.map((deliverable) => {
              const editable = canEditDeliverable(state, currentUser, deliverable)
              const tasks = state.tasks.filter((task) => task.deliverableId === deliverable.id)
              return (
                <article className="deliverable-card" key={deliverable.id} style={{ '--accent': deliverable.color } as CSSProperties}>
                  <div className="deliverable-bar" />
                  <div className="deliverable-fields">
                    <input
                      value={deliverable.title}
                      disabled={!editable}
                      onChange={(event) => updateDeliverable(deliverable.id, { title: event.target.value })}
                      placeholder="Deliverable title"
                    />
                    <textarea
                      className="auto-textarea"
                      rows={textareaRows(deliverable.description, 4)}
                      value={deliverable.description}
                      disabled={!editable}
                      onChange={(event) => updateDeliverable(deliverable.id, { description: event.target.value })}
                      placeholder="Describe the expected business output, acceptance details, and any constraints."
                    />
                    <div className="form-grid compact">
                      <label>
                        Due date and time
                        <input type="datetime-local" value={deliverable.dueAt} disabled={!editable} onChange={(event) => updateDeliverable(deliverable.id, { dueAt: event.target.value })} />
                      </label>
                      <label>
                        Status
                        <select value={deliverable.status} disabled={!editable} onChange={(event) => updateDeliverable(deliverable.id, { status: event.target.value as Deliverable['status'] })}>
                          <option value="not-started">Not Started</option>
                          <option value="in-progress">In Progress</option>
                          <option value="in-review">In Review</option>
                          <option value="complete">Complete</option>
                        </select>
                      </label>
                      <label>
                        Assigned manager
                        <select value={deliverable.assignedManagerId} disabled={currentUser?.role !== 'project-manager'} onChange={(event) => updateDeliverable(deliverable.id, { assignedManagerId: event.target.value })}>
                          <option value="">Unassigned</option>
                          {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name || 'Unnamed manager'}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <aside className="deliverable-side">
                    <Badge tone="blue">{tasks.length} tasks</Badge>
                    <strong>{progressFor(tasks)}%</strong>
                    <small>{memberName(state.members, deliverable.assignedManagerId)}</small>
                    {canAdd && <button className="ghost danger" type="button" onClick={() => deleteDeliverable(deliverable.id)}>Delete</button>}
                  </aside>
                </article>
              )
            })
          ) : (
            <EmptyState title="No deliverables in your view" copy="Project managers can add deliverables and assign them to managers from here." />
          )}
        </div>
      </section>
    )
  }

  function renderTasks() {
    const owners = visibleMembers
    const managers = state.members.filter((member) => member.role === 'manager')
    const deliverables = visibleDeliverables
    const canAdd = canCreateTasks(currentUser)
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Three stacked panels make urgent pending, regular pending, and done work easy to scan.</p>
          </div>
          {canAdd && <button className="primary-btn" type="button" onClick={openNewTask}>Add Task</button>}
        </div>
        <div className="filter-bar">
          <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search tasks, owners, deliverables..." />
          <select value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}>
            <option value="all">All owners</option>
            {owners.map((member) => <option key={member.id} value={member.id}>{member.name || 'Unnamed'}</option>)}
          </select>
          <select value={filters.manager} onChange={(event) => setFilters((current) => ({ ...current, manager: event.target.value }))}>
            <option value="all">All manager teams</option>
            {managers.map((member) => <option key={member.id} value={member.id}>{member.name || 'Unnamed'}'s team</option>)}
          </select>
          <select value={filters.deliverable} onChange={(event) => setFilters((current) => ({ ...current, deliverable: event.target.value }))}>
            <option value="all">All deliverables</option>
            {deliverables.map((deliverable) => <option key={deliverable.id} value={deliverable.id}>{deliverable.title || 'Untitled'}</option>)}
          </select>
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
            <option value="all">All priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <TaskPanel
          title="Urgent Pending"
          tone="red"
          sort={panelSorts.urgent}
          onSort={(sort) => setPanelSorts((current) => ({ ...current, urgent: sort }))}
          tasks={filteredTasksForPanel('urgent')}
          state={state}
          canViewHours={canViewHours}
          canEdit={canAdd}
          onEdit={openEditTask}
          onDelete={deleteTask}
        />
        <TaskPanel
          title="Regular Pending"
          tone="blue"
          sort={panelSorts.pending}
          onSort={(sort) => setPanelSorts((current) => ({ ...current, pending: sort }))}
          tasks={filteredTasksForPanel('pending')}
          state={state}
          canViewHours={canViewHours}
          canEdit={canAdd}
          onEdit={openEditTask}
          onDelete={deleteTask}
        />
        <TaskPanel
          title="Done"
          tone="green"
          sort={panelSorts.done}
          onSort={(sort) => setPanelSorts((current) => ({ ...current, done: sort }))}
          tasks={filteredTasksForPanel('done')}
          state={state}
          canViewHours={canViewHours}
          canEdit={canAdd}
          onEdit={openEditTask}
          onDelete={deleteTask}
        />
      </section>
    )
  }

  function renderTeam() {
    const canAddMembers =
      currentUser?.role === 'project-manager' || (currentUser?.role === 'manager' && state.settings.managersCanAddEmployees)
    const projectManagers = state.members.filter((member) => member.role === 'project-manager')
    const isEditingSelected = Boolean(selectedMember && editingMemberId === selectedMember.id && canEditMemberProfile(currentUser, selectedMember))
    const selectedReportOptions = selectedMember ? reportOptionsForRole(state, selectedMember.role, selectedMember.id) : []
    const selectedOwnedTasks = selectedMember ? tasksForMember(state, selectedMember.id) : []
    const selectedTeamTasks = selectedMember?.role === 'manager' ? tasksForManagerTeam(state, selectedMember.id) : []
    const selectedDeliverables = selectedMember?.role === 'manager' ? state.deliverables.filter((deliverable) => deliverable.assignedManagerId === selectedMember.id) : []
    const directReports = selectedMember ? state.members.filter((member) => member.managerId === selectedMember.id) : []
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Project managers see the full scope tree. Managers see their direct reports and assigned deliverables.</p>
          </div>
          {canAddMembers && <button className="primary-btn" type="button" onClick={openMemberModal}>Add Team Member</button>}
        </div>

        <div className={`team-workspace ${selectedMember ? 'with-detail' : ''}`}>
          <div className="tree-panel org-chart">
            {projectManagers.length ? projectManagers.map((pm) => (
              <div key={pm.id} className="tree-root">
                <div className="tree-top">
                  <PersonNode member={pm} state={state} selected={selectedMemberId === pm.id} onSelect={selectMember} />
                </div>
                <div className="tree-branches">
                  {state.members
                    .filter((member) => member.role === 'manager' && (member.managerId === pm.id || (!member.managerId && projectManagers[0]?.id === pm.id)))
                    .map((manager) => (
                    <div key={manager.id} className="tree-branch">
                      <div className="manager-node-card">
                        <PersonNode member={manager} state={state} selected={selectedMemberId === manager.id} onSelect={selectMember} />
                        <div className="deliverable-chip-row">
                          <small>Deliverables ({state.deliverables.filter((deliverable) => deliverable.assignedManagerId === manager.id).length})</small>
                          <div>
                            {state.deliverables.filter((deliverable) => deliverable.assignedManagerId === manager.id).map((deliverable) => (
                              <button key={deliverable.id} className="mini-deliverable" type="button" onClick={() => { setFilters((current) => ({ ...current, deliverable: deliverable.id, manager: manager.id, owner: 'all' })); setView('tasks') }}>
                                <strong>{deliverable.title || 'Untitled deliverable'}</strong>
                                <small>{state.tasks.filter((task) => task.deliverableId === deliverable.id).length} tasks</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="employee-branches">
                        {state.members.filter((member) => member.managerId === manager.id).map((employee) => (
                          <PersonNode key={employee.id} member={employee} state={state} compact selected={selectedMemberId === employee.id} onSelect={selectMember} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )) : <EmptyState title="No project manager yet" copy="Add a project manager so TrackFlow can anchor the team tree." />}
          </div>

          {selectedMember && (
            <aside className="member-detail-panel" data-member-id={selectedMember.id}>
              <div className="member-detail-head">
                <div className="member-detail-title">
                  <span className="avatar large" style={{ '--member-color': selectedMember.color } as CSSProperties}>{selectedMember.name.slice(0, 1).toUpperCase() || '?'}</span>
                  <div>
                    <h3>{selectedMember.name || 'Unnamed member'}</h3>
                    <small>{memberSubtitle(selectedMember)}</small>
                  </div>
                </div>
                <div className="member-detail-actions">
                  {canEditMemberProfile(currentUser, selectedMember) && (
                    <button className="secondary-btn slim" type="button" onClick={() => setEditingMemberId(isEditingSelected ? '' : selectedMember.id)}>
                      {isEditingSelected ? 'Done' : 'Edit'}
                    </button>
                  )}
                  <button className="close-panel" type="button" aria-label="Close member detail" onClick={() => { setSelectedMemberId(''); setEditingMemberId('') }}>X</button>
                </div>
              </div>

              <div className="detail-actions-row">
                <button className="secondary-btn slim" type="button" onClick={() => focusTasksForMember(selectedMember)}>View person tasks</button>
                {selectedMember.role === 'manager' && <button className="secondary-btn slim" type="button" onClick={() => focusTasksForManager(selectedMember)}>View team tasks</button>}
              </div>

              <div className="member-detail-section">
                <h4>Profile</h4>
                <div className="form-grid single">
                  <label>
                    Name
                    <input value={selectedMember.name} disabled={!isEditingSelected} onChange={(event) => updateMember(selectedMember.id, { name: event.target.value })} />
                  </label>
                  <label>
                    Email
                    <input value={selectedMember.email} disabled={!isEditingSelected} onChange={(event) => updateMember(selectedMember.id, { email: event.target.value })} placeholder="name@company.com" />
                  </label>
                  <label>
                    Role
                    <select value={selectedMember.role} disabled={!isEditingSelected || !canEditMemberStructure(currentUser)} onChange={(event) => changeMemberRole(selectedMember, event.target.value as UserRole)}>
                      <option value="project-manager">Project Manager</option>
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                  </label>
                  <label>
                    Job title
                    <input value={selectedMember.jobTitle} disabled={!isEditingSelected} onChange={(event) => updateMember(selectedMember.id, { jobTitle: event.target.value })} />
                  </label>
                  <label>
                    Reports to
                    <select
                      value={selectedMember.managerId}
                      disabled={!isEditingSelected || !canEditMemberStructure(currentUser) || selectedMember.role === 'project-manager'}
                      onChange={(event) => updateMember(selectedMember.id, { managerId: event.target.value })}
                    >
                      <option value="">{selectedMember.role === 'project-manager' ? 'Project managers do not report inside this project' : 'Choose reporting lead'}</option>
                      {selectedReportOptions.map((leader) => <option key={leader.id} value={leader.id}>{leader.name || 'Unnamed'} ({roleMeta[leader.role].label})</option>)}
                    </select>
                  </label>
                  <label>
                    Strengths
                    <input value={selectedMember.strengths} disabled={!isEditingSelected} onChange={(event) => updateMember(selectedMember.id, { strengths: event.target.value })} placeholder="Research, design, finance..." />
                  </label>
                  <label>
                    Availability
                    <input value={selectedMember.availability} disabled={!isEditingSelected} onChange={(event) => updateMember(selectedMember.id, { availability: event.target.value })} placeholder="20h/week, weekdays, evenings..." />
                  </label>
                </div>
              </div>

              <div className="member-detail-section">
                <h4>Access</h4>
                <p className="member-permission-note">
                  PMs can tune manager and employee permissions here. Managers can only adjust limited direct-report task/context access.
                </p>
                <div className="permission-grid">
                  {(['canViewEvidence', 'canViewHours', 'canEditTasks', 'canViewProjectContext'] as (keyof PermissionSet)[]).map((key) => (
                    <label key={key} className="toggle-row">
                      <input
                        type="checkbox"
                        checked={selectedMember.permissions[key]}
                        disabled={!isEditingSelected || selectedMember.role === 'project-manager' || !canEditMemberPermission(currentUser, selectedMember, key)}
                        onChange={(event) => updateMemberPermission(selectedMember.id, key, event.target.checked)}
                      />
                      <span>{permissionLabel(key)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="member-detail-section">
                <h4>Working On</h4>
                <div className="work-summary-grid">
                  <span><strong>{selectedOwnedTasks.length}</strong><small>owned tasks</small></span>
                  <span><strong>{selectedTeamTasks.length}</strong><small>team tasks</small></span>
                  <span><strong>{selectedDeliverables.length}</strong><small>deliverables</small></span>
                  <span><strong>{directReports.length}</strong><small>direct reports</small></span>
                </div>
                <div className="work-list">
                  {(selectedMember.role === 'manager' ? selectedTeamTasks : selectedOwnedTasks).slice(0, 6).map((task) => (
                    <button key={task.id} className="work-item" type="button" onClick={() => { setFilters((current) => ({ ...current, owner: task.ownerId, manager: 'all', deliverable: task.deliverableId })); setView('tasks') }}>
                      <strong>{task.title}</strong>
                      <small>{memberName(state.members, task.ownerId)} - {deliverableName(state.deliverables, task.deliverableId)} - {statusMeta[task.status].label}</small>
                    </button>
                  ))}
                  {!(selectedMember.role === 'manager' ? selectedTeamTasks : selectedOwnedTasks).length && <EmptyState title="No visible work yet" copy="Assigned tasks will appear here once work is created." />}
                </div>
              </div>

              {canEditMemberStructure(currentUser) && selectedMember.role !== 'project-manager' && (
                <button className="danger-btn" type="button" onClick={() => deleteMember(selectedMember.id)}>Remove Team Member</button>
              )}
            </aside>
          )}
        </div>
      </section>
    )
  }

  function renderSubmissions() {
    const ownTasks = currentUser ? state.tasks.filter((task) => task.ownerId === currentUser.id && task.status !== 'done' && task.status !== 'in-review') : []
    const selectedTask = state.tasks.find((task) => task.id === submissionDraft.taskId)
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Submissions must be tied to a task and include a required work description. File and link evidence have been removed.</p>
          </div>
        </div>

        <div className="split-grid">
          <form className="submission-form" onSubmit={submitWork}>
            <h3>Submit completed work</h3>
            <label>
              Your assigned task
              <select value={submissionDraft.taskId} onChange={(event) => setSubmissionDraft((draft) => ({ ...draft, taskId: event.target.value }))} required>
                <option value="">Choose one of your tasks</option>
                {ownTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label>
              Deliverable
              <input value={selectedTask ? deliverableName(state.deliverables, selectedTask.deliverableId) : ''} readOnly placeholder="Selected automatically from the task" />
            </label>
            <div className="form-grid compact">
              <label>
                Date and time
                <input type="datetime-local" value={submissionDraft.date} onChange={(event) => setSubmissionDraft((draft) => ({ ...draft, date: event.target.value }))} required />
              </label>
              <label>
                Hours
                <input type="number" step="0.25" min="0.25" value={submissionDraft.hours} onChange={(event) => setSubmissionDraft((draft) => ({ ...draft, hours: event.target.value }))} required />
              </label>
            </div>
            <label>
              Required description
              <textarea rows={5} value={submissionDraft.description} onChange={(event) => setSubmissionDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Describe what you completed, what changed, and anything the manager should review." required />
            </label>
            <button className="primary-btn" type="submit" disabled={!canSubmitWork}>Submit Task Work</button>
            {!canSubmitWork && <small>You do not currently have pending tasks assigned to you.</small>}
          </form>

          <Card title={canViewHours ? 'Hours Ledger' : 'Hours Visibility Locked'}>
            {canViewHours ? <HoursBars state={state} members={visibleHourMembers} /> : <EmptyState title="Hours are hidden" copy="A project manager can allow own-hour or team-hour visibility from Settings, or grant a team-hours override on the Teams page." />}
          </Card>
        </div>

        <Card title="Visible Submission History">
          <div className="record-list">
            {visibleSubmissions.length ? (
              visibleSubmissions.map((entry) => (
                <button key={entry.id} className="record-row" type="button" onClick={() => setSelectedSubmissionId(entry.id)}>
                  <Badge tone={submissionMeta[entry.status].tone}>{submissionMeta[entry.status].label}</Badge>
                  <span>
                    <strong>{taskName(state.tasks, entry.taskId)}</strong>
                    <small>{memberName(state.members, entry.memberId)} - {formatDate(entry.date)} - {canViewHours ? formatHours(entry.hours) : 'hours hidden'}</small>
                  </span>
                </button>
              ))
            ) : (
              <EmptyState title="No visible submissions" copy="Submitted task work will appear here based on role permissions." />
            )}
          </div>
        </Card>
      </section>
    )
  }

  function renderEvidence() {
    if (!canViewEvidence) {
      return (
        <section className="page-stack">
          <PermissionWall title="Submission Records are restricted" copy="A project manager can grant submission-record access from Settings or the Teams page." />
        </section>
      )
    }
    const selected = state.submissions.find((entry) => entry.id === selectedSubmissionId) ?? visibleSubmissions[0]
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Managers can approve, return, or remove submissions. Removed records reopen the task but keep the logged hours.</p>
          </div>
        </div>
        <div className="evidence-grid">
          <div className="record-list tall">
            {visibleSubmissions.length ? (
              visibleSubmissions.map((entry) => (
                <button key={entry.id} className={`record-row ${selected?.id === entry.id ? 'active' : ''}`} type="button" onClick={() => setSelectedSubmissionId(entry.id)}>
                  <Badge tone={submissionMeta[entry.status].tone}>{submissionMeta[entry.status].label}</Badge>
                  <span>
                    <strong>{taskName(state.tasks, entry.taskId)}</strong>
                    <small>{memberName(state.members, entry.memberId)} - {formatDate(entry.date)}</small>
                  </span>
                </button>
              ))
            ) : (
              <EmptyState title="No submission records" copy="Task submissions will collect here after employees submit work." />
            )}
          </div>
          <div className="record-detail">
            {selected ? (
              <>
                <div className="detail-head">
                  <div>
                    <Badge tone={submissionMeta[selected.status].tone}>{submissionMeta[selected.status].label}</Badge>
                    <h3>{taskName(state.tasks, selected.taskId)}</h3>
                    <p>{deliverableName(state.deliverables, selected.deliverableId)}</p>
                  </div>
                  {canViewHours && <span className="hour-chip">{formatHours(selected.hours)}</span>}
                </div>
                <dl className="detail-list">
                  <div><dt>Submitted by</dt><dd>{memberName(state.members, selected.memberId)}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(selected.date)}</dd></div>
                  <div><dt>Reviewer</dt><dd>{memberName(state.members, selected.reviewerId)}</dd></div>
                  <div><dt>Review note</dt><dd>{selected.reviewNote || 'No note.'}</dd></div>
                </dl>
                <div className="description-box">{selected.description}</div>
                {canReviewSubmission(state, currentUser, selected) && selected.status === 'submitted' && (
                  <div className="review-actions">
                    <button className="primary-btn" type="button" onClick={() => reviewSubmission(selected.id, 'approved')}>Approve</button>
                    <button className="secondary-btn" type="button" onClick={() => reviewSubmission(selected.id, 'returned')}>Return to Employee</button>
                    <button className="danger-btn" type="button" onClick={() => reviewSubmission(selected.id, 'removed')}>Remove from Active Records</button>
                  </div>
                )}
                {canReviewSubmission(state, currentUser, selected) && selected.status !== 'submitted' && (
                  <div className="review-closed">
                    This review is closed. If the employee needs to redo the work, the reopened task can be submitted again from Task Submissions.
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="Select a submission" copy="Click a record to review its details." />
            )}
          </div>
        </div>
      </section>
    )
  }

  function renderRisks() {
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Risk language stays neutral: the goal is early support, not blame.</p>
          </div>
        </div>
        <div className="risk-grid">
          {risks.length ? (
            risks.map((risk) => (
              <article key={risk.id} className={`risk-card ${risk.severity}`}>
                <Badge tone={risk.severity === 'high' ? 'berry' : risk.severity === 'medium' ? 'gold' : 'blue'}>{risk.type}</Badge>
                <p>{risk.message}</p>
                {currentUser?.role !== 'employee' && (
                  <button className="ghost" type="button" onClick={() => setState((current) => ({ ...current, dismissedRiskIds: [...current.dismissedRiskIds, risk.id] }))}>Dismiss</button>
                )}
              </article>
            ))
          ) : (
            <EmptyState title="No active risk flags" copy="Overdue, blocked, unassigned, unreviewed, and unsupported work will appear here." />
          )}
        </div>
      </section>
    )
  }

  function renderReport() {
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Export a stakeholder-ready summary without rebuilding the project story manually.</p>
          </div>
          <div className="action-row">
            <button className="secondary-btn" type="button" onClick={copyReport}>Copy</button>
            <button className="primary-btn" type="button" onClick={saveReport}>Save Report</button>
          </div>
        </div>
        <textarea className="report-editor" value={reportText} onChange={(event) => setReportText(event.target.value)} />
      </section>
    )
  }

  function renderSettings() {
    return (
      <section className="page-stack">
        <div className="section-head">
          <div>
            <p>Project-manager controls for permissions, data safety, and role behavior.</p>
          </div>
        </div>
        <div className="split-grid">
          <Card title="Default Employee Visibility">
            <div className="settings-list">
              <p>
                These defaults apply to all employees unless an individual override is checked on the Teams page.
              </p>
              <label>
                Submission record visibility
                <select value={state.settings.employeeRecordVisibility} onChange={(event) => updateSettings({ employeeRecordVisibility: event.target.value as VisibilityScope })}>
                  <option value="none">No records page; submit form only</option>
                  <option value="own">Own submission history only</option>
                  <option value="team">Entire team submission records</option>
                </select>
                <small>{recordVisibilityLabel(state.settings.employeeRecordVisibility)}</small>
              </label>
              <label>
                Work-hour visibility
                <select value={state.settings.employeeHourVisibility} onChange={(event) => updateSettings({ employeeHourVisibility: event.target.value as VisibilityScope })}>
                  <option value="none">Hide hours from employees</option>
                  <option value="own">Employees see only their own hours</option>
                  <option value="team">Employees see entire team hours</option>
                </select>
                <small>{hourVisibilityLabel(state.settings.employeeHourVisibility)}</small>
              </label>
              <Toggle label="Employees can view project context" checked={state.settings.employeesCanViewProjectContext} onChange={(checked) => updateSettings({ employeesCanViewProjectContext: checked })} />
              <Toggle label="Require manager approval before tasks become done" checked={state.settings.requireApprovalForCompletion} onChange={(checked) => updateSettings({ requireApprovalForCompletion: checked })} />
            </div>
          </Card>
          <Card title="Manager Controls">
            <div className="settings-list">
              <Toggle label="Managers can edit assigned deliverables" checked={state.settings.managersCanEditDeliverables} onChange={(checked) => updateSettings({ managersCanEditDeliverables: checked })} />
              <Toggle label="Managers can add employees to their team" checked={state.settings.managersCanAddEmployees} onChange={(checked) => updateSettings({ managersCanAddEmployees: checked })} />
              <label>
                No-submission risk window
                <input type="number" min="1" value={state.settings.noSubmissionWindowDays} onChange={(event) => updateSettings({ noSubmissionWindowDays: Number(event.target.value) })} />
              </label>
            </div>
          </Card>
        </div>
        <Card title="Role Permission Matrix">
          <div className="matrix">
            <div>Capability</div><div>PM</div><div>Manager</div><div>Employee</div>
            <div>Project setup</div><div>Full</div><div>Restricted</div><div>No</div>
            <div>Deliverable ownership</div><div>Assigns managers</div><div>Own assigned</div><div>View if allowed</div>
            <div>Task creation</div><div>All</div><div>Direct team</div><div>Only if toggled</div>
            <div>Task submissions</div><div>Own tasks</div><div>Own tasks</div><div>Own tasks</div>
            <div>Hours visibility</div><div>All</div><div>Managed team</div><div>None, own, or team</div>
            <div>Submission records</div><div>All</div><div>Managed team</div><div>None, own, or team</div>
            <div>Submission review</div><div>All</div><div>Team</div><div>No</div>
          </div>
        </Card>
        <Card title="Local Data">
          <div className="settings-list">
            <p>Active workspace file: <code>{storageInfo?.workspaceFile ?? 'API not connected'}</code></p>
            <div className="action-row">
              <button className="secondary-btn" type="button" onClick={exportBackup}>Export Backup</button>
              <label className="file-btn">
                Import Backup
                <input type="file" accept="application/json" onChange={importBackup} />
              </label>
              <button className="danger-btn" type="button" onClick={resetWorkspace}>Start Blank Workspace</button>
            </div>
          </div>
        </Card>
      </section>
    )
  }

  function renderMemberModal() {
    if (!showMemberModal) return null
    const role = currentUser?.role === 'manager' ? 'employee' : memberDraft.role
    const reportOptions = currentUser?.role === 'manager' && currentUser ? [currentUser] : reportOptionsForRole(state, role)
    const canConfigureDraftPermission = (key: keyof PermissionSet) =>
      currentUser?.role === 'project-manager' || (currentUser?.role === 'manager' && (key === 'canEditTasks' || key === 'canViewProjectContext'))

    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <form className="member-modal" onSubmit={addMember}>
          <div className="modal-head">
            <div>
              <h2>Add Team Member</h2>
              <p>Add the person, reporting line, and starting permissions in one place.</p>
            </div>
            <button className="ghost" type="button" onClick={closeMemberModal}>Close</button>
          </div>

          <div className="form-grid">
            <label>
              Name
              <input value={memberDraft.name} onChange={(event) => setMemberDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Employee or manager name" required />
            </label>
            <label>
              Email
              <input value={memberDraft.email} onChange={(event) => setMemberDraft((draft) => ({ ...draft, email: event.target.value }))} placeholder="name@company.com" />
            </label>
            {currentUser?.role === 'project-manager' && (
              <label>
                Role
                <select
                  value={memberDraft.role}
                  onChange={(event) => {
                    const nextRole = event.target.value as UserRole
                    const options = reportOptionsForRole(state, nextRole)
                    const defaults = createMember(nextRole, state.members.length).permissions
                    setMemberDraft((draft) => ({
                      ...draft,
                      role: nextRole,
                      permissions: defaults,
                      managerId: validManagerIdForRole(options, draft.managerId),
                      jobTitle: !draft.jobTitle || draft.jobTitle === roleDefaultTitle[draft.role] ? roleDefaultTitle[nextRole] : draft.jobTitle,
                    }))
                  }}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="project-manager">Project Manager</option>
                </select>
              </label>
            )}
            <label>
              Job title
              <input value={memberDraft.jobTitle} onChange={(event) => setMemberDraft((draft) => ({ ...draft, jobTitle: event.target.value }))} />
            </label>
            <label>
              Reports to
              <select
                value={currentUser?.role === 'manager' ? currentUser.id : memberDraft.managerId}
                disabled={currentUser?.role === 'manager' || role === 'project-manager'}
                onChange={(event) => setMemberDraft((draft) => ({ ...draft, managerId: event.target.value }))}
              >
                <option value="">{role === 'project-manager' ? 'Project managers do not report inside this project' : 'Choose reporting lead'}</option>
                {reportOptions.map((leader) => <option key={leader.id} value={leader.id}>{leader.name || 'Unnamed'} ({roleMeta[leader.role].label})</option>)}
              </select>
            </label>
            <label>
              Strengths
              <input value={memberDraft.strengths} onChange={(event) => setMemberDraft((draft) => ({ ...draft, strengths: event.target.value }))} placeholder="Research, design, finance..." />
            </label>
            <label>
              Availability
              <input value={memberDraft.availability} onChange={(event) => setMemberDraft((draft) => ({ ...draft, availability: event.target.value }))} placeholder="20h/week, weekdays, evenings..." />
            </label>
          </div>

          <div className="member-detail-section">
            <h4>Starting permissions</h4>
            <p className="member-permission-note">
              PMs can configure manager and employee permissions. Managers can only set limited task/context permissions for new direct reports.
            </p>
            <div className="permission-grid">
              {(['canViewEvidence', 'canViewHours', 'canEditTasks', 'canViewProjectContext'] as (keyof PermissionSet)[]).map((key) => (
                <label key={key} className="toggle-row">
                  <input
                    type="checkbox"
                    checked={role === 'project-manager' || memberDraft.permissions[key]}
                    disabled={role === 'project-manager' || !canConfigureDraftPermission(key)}
                    onChange={(event) => setMemberDraft((draft) => ({ ...draft, permissions: { ...draft.permissions, [key]: event.target.checked } }))}
                  />
                  <span>{permissionLabel(key)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button className="secondary-btn" type="button" onClick={closeMemberModal}>Cancel</button>
            <button className="primary-btn" type="submit">Add Team Member</button>
          </div>
        </form>
      </div>
    )
  }

  function renderSetupModal() {
    if (!showSetupModal) return null
    const managers = setupDraft.members.filter((member) => member.role === 'manager')
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <form className="setup-modal" onSubmit={saveSetup}>
          <div className="modal-head">
            <div>
              <h2>Corporate Project Setup</h2>
              <p>Fast setup for project scope, managers, deliverables, and the starting team.</p>
            </div>
            <button className="ghost" type="button" onClick={() => setShowSetupModal(false)}>Close</button>
          </div>
          <div className="stepper">
            {['Project', 'Template', 'Deliverables', 'Team'].map((label, index) => (
              <button key={label} type="button" className={setupStep === index ? 'active' : ''} onClick={() => setSetupStep(index)}>{label}</button>
            ))}
          </div>
          {setupStep === 0 && (
            <div className="form-grid">
              <label>Project name<input value={setupDraft.project.name} onChange={(event) => updateProjectSetup('name', event.target.value)} required /></label>
              <label>Business unit<input value={setupDraft.project.businessUnit} onChange={(event) => updateProjectSetup('businessUnit', event.target.value)} placeholder="Revenue Operations, Engineering, PMO..." /></label>
              <label>Team name<input value={setupDraft.project.teamName} onChange={(event) => updateProjectSetup('teamName', event.target.value)} /></label>
              <label>Final deadline with time<input type="datetime-local" value={setupDraft.project.deadlineAt} onChange={(event) => updateProjectSetup('deadlineAt', event.target.value)} /></label>
              <label className="full">Description<textarea rows={5} value={setupDraft.project.description} onChange={(event) => updateProjectSetup('description', event.target.value)} placeholder="What is the business outcome this team needs to deliver?" /></label>
            </div>
          )}
          {setupStep === 1 && (
            <div className="template-grid">
              {templateCatalog.map((template) => (
                <button key={template.name} type="button" className={setupDraft.template === template.name ? 'template-card active' : 'template-card'} onClick={() => applyTemplate(template.name)}>
                  <strong>{template.name}</strong>
                  <small>{template.helper}</small>
                </button>
              ))}
            </div>
          )}
          {setupStep === 2 && (
            <div className="modal-list">
              <button type="button" className="secondary-btn" onClick={() => setSetupDraft((draft) => ({ ...draft, deliverables: [createDeliverable('', draft.deliverables.length, draft.project.deadlineAt), ...draft.deliverables] }))}>Add deliverable at top</button>
              {setupDraft.deliverables.map((deliverable) => (
                <div key={deliverable.id} className="setup-row">
                  <input value={deliverable.title} onChange={(event) => updateSetupDeliverable(deliverable.id, { title: event.target.value })} placeholder="Deliverable title" />
                  <select value={deliverable.assignedManagerId} onChange={(event) => updateSetupDeliverable(deliverable.id, { assignedManagerId: event.target.value })}>
                    <option value="">Assign manager later</option>
                    {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name || 'Unnamed manager'}</option>)}
                  </select>
                  <input type="datetime-local" value={deliverable.dueAt} onChange={(event) => updateSetupDeliverable(deliverable.id, { dueAt: event.target.value })} />
                  <textarea rows={textareaRows(deliverable.description, 2)} value={deliverable.description} onChange={(event) => updateSetupDeliverable(deliverable.id, { description: event.target.value })} placeholder="Deliverable description" />
                </div>
              ))}
            </div>
          )}
          {setupStep === 3 && (
            <div className="modal-list">
              <button type="button" className="secondary-btn" onClick={() => setSetupDraft((draft) => ({ ...draft, members: [createMember('employee', draft.members.length), ...draft.members] }))}>Add team member at top</button>
              {setupDraft.members.map((member) => {
                const reportOptions = setupReportOptions(setupDraft.members, member.role, member.id)
                return (
                  <div key={member.id} className="setup-row team-row">
                    <input value={member.name} onChange={(event) => updateSetupMember(member.id, { name: event.target.value })} placeholder="Name" />
                    <input value={member.email} onChange={(event) => updateSetupMember(member.id, { email: event.target.value })} placeholder="Email" />
                    <select
                      value={member.role}
                      onChange={(event) => {
                        const role = event.target.value as UserRole
                        const options = setupReportOptions(setupDraft.members, role, member.id)
                        updateSetupMember(member.id, {
                          role,
                          managerId: validManagerIdForRole(options, member.managerId),
                          jobTitle: !member.jobTitle || member.jobTitle === roleDefaultTitle[member.role] ? roleDefaultTitle[role] : member.jobTitle,
                        })
                      }}
                    >
                      <option value="project-manager">Project Manager</option>
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                    <select value={member.managerId} disabled={member.role === 'project-manager'} onChange={(event) => updateSetupMember(member.id, { managerId: event.target.value })}>
                      <option value="">{member.role === 'project-manager' ? 'PM root' : 'Reports to...'}</option>
                      {reportOptions.map((leader) => <option key={leader.id} value={leader.id}>{leader.name || 'Unnamed'} ({roleMeta[leader.role].label})</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={() => setSetupStep(Math.max(0, setupStep - 1))}>Back</button>
            {setupStep < 3 ? <button type="button" className="primary-btn" onClick={() => setSetupStep(setupStep + 1)}>Next</button> : <button type="submit" className="primary-btn">Save Workspace</button>}
          </div>
        </form>
      </div>
    )
  }

  function renderTaskModal() {
    if (!showTaskModal) return null
    const owners = scopedOwnersForTask(state, currentUser)
    const deliverables = scopedDeliverablesForTask(state, currentUser)
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <form className="task-modal" onSubmit={saveTask}>
          <div className="modal-head">
            <div>
              <h2>{editingTaskId ? 'Edit Task' : 'Create Task'}</h2>
              <p>New tasks are inserted at the top of the board.</p>
            </div>
            <button className="ghost" type="button" onClick={() => setShowTaskModal(false)}>Close</button>
          </div>
          <div className="form-grid">
            <label className="full">Title<input value={taskDraft.title} onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))} required /></label>
            <label>Deliverable<select value={taskDraft.deliverableId} onChange={(event) => setTaskDraft((draft) => ({ ...draft, deliverableId: event.target.value }))} required>{deliverables.map((deliverable) => <option key={deliverable.id} value={deliverable.id}>{deliverable.title || 'Untitled'}</option>)}</select></label>
            <label>Owner<select value={taskDraft.ownerId} onChange={(event) => setTaskDraft((draft) => ({ ...draft, ownerId: event.target.value }))} required>{owners.map((member) => <option key={member.id} value={member.id}>{member.name || 'Unnamed'} - {roleMeta[member.role].label}</option>)}</select></label>
            <label>Due date and time<input type="datetime-local" value={taskDraft.dueAt} onChange={(event) => setTaskDraft((draft) => ({ ...draft, dueAt: event.target.value }))} /></label>
            <label>Priority<select value={taskDraft.priority} onChange={(event) => setTaskDraft((draft) => ({ ...draft, priority: event.target.value as Priority }))}><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label>Status<select value={taskDraft.status} onChange={(event) => setTaskDraft((draft) => ({ ...draft, status: event.target.value as TaskStatus }))}><option value="pending">Pending</option><option value="in-progress">In Progress</option><option value="in-review">In Review</option><option value="blocked">Blocked</option><option value="done">Done</option></select></label>
            <label className="full">Description<textarea rows={5} value={taskDraft.description} onChange={(event) => setTaskDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
          </div>
          <div className="modal-actions">
            <button className="secondary-btn" type="button" onClick={() => setShowTaskModal(false)}>Cancel</button>
            <button className="primary-btn" type="submit">Save Task</button>
          </div>
        </form>
      </div>
    )
  }

  if (!currentUser) return renderLogin()

  const content = {
    dashboard: renderDashboard,
    deliverables: renderDeliverables,
    tasks: renderTasks,
    team: renderTeam,
    submissions: renderSubmissions,
    evidence: renderEvidence,
    risks: renderRisks,
    report: renderReport,
    settings: renderSettings,
  }[activeView]

  return (
    <div className="page-shell">
      <div className="decor-grid" />
      <div className="app-shell">
        <header className="global-header">
          <button className="brand" type="button" onClick={() => setView('dashboard')} aria-label="TrackFlow dashboard">
            <span className="trackflow-wordmark header-wordmark" aria-label="TrackFlow" />
          </button>
          <div className="global-status">
            <Badge tone={syncStatus === 'saved' ? 'green' : syncStatus === 'saving' ? 'gold' : 'coral'}>{syncStatus}</Badge>
          </div>
        </header>

        <aside className="sidebar">
          <nav className="nav-list" aria-label="Main navigation">
            {accessibleNavItems().map((item) => (
              <button key={item.id} type="button" className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
                <span className="nav-dot" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.sub}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="storage-card">
            <strong>{currentUser.name}</strong>
            <span>{roleMeta[currentUser.role].label}</span>
            <button type="button" className="secondary-btn slim" onClick={() => setActiveUserId('')}>Switch user</button>
          </div>
        </aside>

        <main className="app-main">
          <section className="topbar">
            <div>
              <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
              <p>{pageHelp[activeView]}</p>
            </div>
            <div className="topbar-meta">
              <strong>{state.project.teamName || 'No team name'}</strong>
              <small>{formatDateTime(state.project.deadlineAt)}</small>
            </div>
          </section>
          <section className="content-area">{content()}</section>
        </main>
      </div>
      {notice && <div className="toast">{notice}</div>}
      {renderSetupModal()}
      {renderMemberModal()}
      {renderTaskModal()}
    </div>
  )
}

function permissionLabel(key: keyof PermissionSet) {
  if (key === 'canViewEvidence') return 'View submission records'
  if (key === 'canViewHours') return 'View hours'
  if (key === 'canEditTasks') return 'Edit tasks'
  return 'Project context'
}

function hourVisibilityLabel(scope: VisibilityScope) {
  if (scope === 'team') return 'team-visible hours'
  if (scope === 'own') return 'own hours only'
  return 'hidden from this role'
}

function recordVisibilityLabel(scope: VisibilityScope) {
  if (scope === 'team') return 'team submissions'
  if (scope === 'own') return 'own submissions only'
  return 'hidden outside the submit form'
}

function memberSubtitle(member: TeamMember) {
  const role = roleMeta[member.role].label
  if (!member.jobTitle || member.jobTitle === role || member.jobTitle === roleDefaultTitle[member.role]) return role
  return `${role} - ${member.jobTitle}`
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <article className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </article>
  )
}

function MetricCard({ label, value, helper, tone }: { label: string; value: string | number; helper: string; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  )
}

function PermissionWall({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="permission-wall">
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function TaskPanel({
  title,
  tone,
  sort,
  onSort,
  tasks,
  state,
  canViewHours,
  canEdit,
  onEdit,
  onDelete,
}: {
  title: string
  tone: string
  sort: SortMode
  onSort: (sort: SortMode) => void
  tasks: Task[]
  state: TrackFlowState
  canViewHours: boolean
  canEdit: boolean
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
}) {
  return (
    <section className={`task-panel ${tone}`}>
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          <small>{tasks.length} tasks</small>
        </div>
        <select value={sort} onChange={(event) => onSort(event.target.value as SortMode)} aria-label={`Sort ${title}`}>
          <option value="due-asc">Due soonest</option>
          <option value="due-desc">Due latest</option>
          <option value="priority">Priority</option>
          <option value="owner">Owner</option>
          <option value="recent">Recently updated</option>
        </select>
      </div>
      <div className="task-list">
        {tasks.length ? (
          tasks.map((task) => (
            <article key={task.id} className="task-card">
              <div className="task-main">
                <div className="task-title-row">
                  <h4>{task.title}</h4>
                  <Badge tone={statusMeta[task.status].tone}>{statusMeta[task.status].label}</Badge>
                </div>
                <p>{task.description || 'No description yet.'}</p>
                <div className="task-meta">
                  <span>{memberName(state.members, task.ownerId)}</span>
                  <span>{managerNameForTask(state, task)}</span>
                  <span>{deliverableName(state.deliverables, task.deliverableId)}</span>
                  <span>{formatDateTime(task.dueAt)}</span>
                  {canViewHours && <span>{formatHours(hoursForTask(state, task.id))}</span>}
                </div>
              </div>
              <div className="task-actions">
                <Badge tone={task.priority === 'urgent' || task.priority === 'high' ? 'berry' : 'blue'}>{task.priority}</Badge>
                {canEdit && (
                  <>
                    <button className="ghost" type="button" onClick={() => onEdit(task)}>Edit</button>
                    <button className="ghost danger" type="button" onClick={() => onDelete(task.id)}>Delete</button>
                  </>
                )}
              </div>
            </article>
          ))
        ) : (
          <EmptyState title={`No ${title.toLowerCase()} tasks`} copy="Tasks that match this panel and filter set will appear here." />
        )}
      </div>
    </section>
  )
}

function PersonNode({
  member,
  state,
  compact = false,
  selected = false,
  onSelect,
}: {
  member: TeamMember
  state: TrackFlowState
  compact?: boolean
  selected?: boolean
  onSelect?: (memberId: string) => void
}) {
  return (
    <button
      className={`person-node ${compact ? 'compact' : ''} ${selected ? 'selected' : ''}`}
      style={{ '--member-color': member.color } as CSSProperties}
      type="button"
      onClick={() => onSelect?.(member.id)}
    >
      <span className="avatar">{member.name.slice(0, 1).toUpperCase() || '?'}</span>
      <span>
        <strong>{member.name || 'Unnamed member'}</strong>
        <small>{memberSubtitle(member)} {compact ? `- ${formatHours(hoursForMember(state, member.id))}` : ''}</small>
      </span>
    </button>
  )
}

function HoursBars({ state, members }: { state: TrackFlowState; members: TeamMember[] }) {
  const max = Math.max(1, ...members.map((member) => hoursForMember(state, member.id)))
  return (
    <div className="hours-bars">
      {members.length ? (
        members.map((member) => {
          const hours = hoursForMember(state, member.id)
          return (
            <div key={member.id} className="hours-row">
              <span>{member.name || 'Unnamed'}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(4, (hours / max) * 100)}%`, background: member.color }} />
              </div>
              <strong>{formatHours(hours)}</strong>
            </div>
          )
        })
      ) : (
        <EmptyState title="No members visible" copy="Hours appear after team members and task submissions exist." />
      )}
    </div>
  )
}

export default App
