export type UserRole = 'project-manager' | 'manager' | 'employee'

export type TaskStatus = 'pending' | 'in-progress' | 'in-review' | 'done' | 'blocked'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type SubmissionStatus = 'submitted' | 'approved' | 'returned' | 'removed'

export type SortMode = 'due-asc' | 'due-desc' | 'priority' | 'owner' | 'recent'

export type VisibilityScope = 'none' | 'own' | 'team'

export interface PermissionSet {
  canViewEvidence: boolean
  canViewHours: boolean
  canEditTasks: boolean
  canViewProjectContext: boolean
}

export interface Project {
  id: string
  name: string
  businessUnit: string
  description: string
  teamName: string
  deadlineAt: string
  createdAt: string
  updatedAt: string
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: UserRole
  jobTitle: string
  strengths: string
  availability: string
  managerId: string
  color: string
  permissions: PermissionSet
}

export interface Deliverable {
  id: string
  title: string
  description: string
  dueAt: string
  status: 'not-started' | 'in-progress' | 'in-review' | 'complete'
  color: string
  assignedManagerId: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string
  deliverableId: string
  ownerId: string
  createdById: string
  status: TaskStatus
  priority: Priority
  dueAt: string
  createdAt: string
  updatedAt: string
}

export interface TaskSubmission {
  id: string
  memberId: string
  taskId: string
  deliverableId: string
  date: string
  hours: number
  description: string
  status: SubmissionStatus
  reviewNote: string
  reviewerId: string
  reviewedAt: string
  createdAt: string
  updatedAt: string
}

export interface WorkLog {
  id: string
  submissionId: string
  memberId: string
  taskId: string
  deliverableId: string
  date: string
  hours: number
  description: string
  createdAt: string
}

export interface Settings {
  template: string
  calmLanguage: boolean
  supportiveCopy: boolean
  noSubmissionWindowDays: number
  employeeRecordVisibility: VisibilityScope
  employeeHourVisibility: VisibilityScope
  employeesCanViewProjectContext: boolean
  managersCanEditDeliverables: boolean
  managersCanAddEmployees: boolean
  requireApprovalForCompletion: boolean
}

export interface RiskFlag {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high'
  message: string
  relatedTaskId?: string
  relatedMemberId?: string
  relatedDeliverableId?: string
}

export interface TrackFlowState {
  project: Project
  members: TeamMember[]
  deliverables: Deliverable[]
  tasks: Task[]
  submissions: TaskSubmission[]
  workLogs: WorkLog[]
  dismissedRiskIds: string[]
  settings: Settings
}
