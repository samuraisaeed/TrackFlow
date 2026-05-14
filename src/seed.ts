import type { PermissionSet, TrackFlowState } from './types'

export const defaultEmployeePermissions: PermissionSet = {
  canViewEvidence: false,
  canViewHours: false,
  canEditTasks: false,
  canViewProjectContext: true,
}

export function createSeedWorkspace(): TrackFlowState {
  const now = new Date().toISOString()

  return {
    project: {
      id: 'project-blank',
      name: '',
      businessUnit: '',
      description: '',
      teamName: '',
      deadlineAt: '',
      createdAt: now,
      updatedAt: now,
    },
    members: [],
    deliverables: [],
    tasks: [],
    submissions: [],
    workLogs: [],
    dismissedRiskIds: [],
    settings: {
      template: 'Blank corporate workspace',
      calmLanguage: true,
      supportiveCopy: true,
      noSubmissionWindowDays: 7,
      employeeRecordVisibility: 'own',
      employeeHourVisibility: 'none',
      employeesCanViewProjectContext: true,
      managersCanEditDeliverables: false,
      managersCanAddEmployees: true,
      requireApprovalForCompletion: true,
    },
  }
}
