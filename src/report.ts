import type { RiskFlag, TrackFlowState, TaskStatus, UserRole } from './types'

function memberName(state: TrackFlowState, memberId: string) {
  return state.members.find((member) => member.id === memberId)?.name ?? 'Unassigned'
}

function deliverableName(state: TrackFlowState, deliverableId: string) {
  return state.deliverables.find((deliverable) => deliverable.id === deliverableId)?.title ?? 'General'
}

function label(value: string) {
  return value
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function roleLabel(role: UserRole) {
  if (role === 'project-manager') return 'Project Manager'
  if (role === 'manager') return 'Manager'
  return 'Employee'
}

function statusCount(state: TrackFlowState, status: TaskStatus) {
  return state.tasks.filter((task) => task.status === status).length
}

function hoursForMember(state: TrackFlowState, memberId: string) {
  return state.workLogs
    .filter((entry) => entry.memberId === memberId)
    .reduce((total, entry) => total + entry.hours, 0)
}

function formatHours(value: number) {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
  return `${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`
}

function formatDateTime(value: string) {
  if (!value) return 'Not specified'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function buildReport(state: TrackFlowState, risks: RiskFlag[]) {
  const completed = statusCount(state, 'done')
  const pending = state.tasks.filter((task) => task.status !== 'done').length
  const totalHours = state.workLogs.reduce((total, entry) => total + entry.hours, 0)

  const roleLines = state.members.length
    ? state.members
        .map((member) => {
          const manager = member.managerId ? ` Reports to ${memberName(state, member.managerId)}.` : ''
          return `- ${member.name}: ${roleLabel(member.role)}${member.jobTitle ? `, ${member.jobTitle}` : ''}.${manager} Logged hours: ${formatHours(hoursForMember(state, member.id))}.`
        })
        .join('\n')
    : '- No team members have been added yet.'

  const deliverableLines = state.deliverables.length
    ? state.deliverables
        .map((deliverable) => {
          const manager = deliverable.assignedManagerId ? memberName(state, deliverable.assignedManagerId) : 'Unassigned manager'
          return `- ${deliverable.title}: ${label(deliverable.status)}. Owner: ${manager}${deliverable.dueAt ? `. Due ${deliverable.dueAt}` : ''}.`
        })
        .join('\n')
    : '- No deliverables have been added yet.'

  const submissionLines = state.submissions.length
    ? state.submissions
        .map((entry) => {
          const task = state.tasks.find((item) => item.id === entry.taskId)
          return `- ${memberName(state, entry.memberId)} submitted ${formatHours(entry.hours)} on ${formatDateTime(entry.date)} for ${task?.title ?? 'an assigned task'} (${label(entry.status)}): ${entry.description}`
        })
        .join('\n')
    : '- No task submissions have been logged yet.'

  const remainingRisks = risks
    .slice(0, 10)
    .map((risk) => `- ${risk.type}: ${risk.message}`)
    .join('\n')

  const ownershipSnapshot = state.tasks.length
    ? state.tasks
        .map((task) => `- ${task.title}: ${memberName(state, task.ownerId)} - ${label(task.status)} - ${deliverableName(state, task.deliverableId)}`)
        .join('\n')
    : '- No tasks have been created yet.'

  return `# TrackFlow Corporate Project Report

## Project Overview
Project Name: ${state.project.name || 'Untitled project'}
Business Unit: ${state.project.businessUnit || 'Not specified'}
Team: ${state.project.teamName || 'Not specified'}
Final Deadline: ${state.project.deadlineAt || 'Not specified'}

${state.project.description || 'No project description has been added yet.'}

## Team Structure
${roleLines}

## Deliverables
${deliverableLines}

## Task Summary
Total Tasks: ${state.tasks.length}
Pending: ${pending}
In Review: ${statusCount(state, 'in-review')}
Completed: ${completed}
Blocked: ${statusCount(state, 'blocked')}
Logged Hours: ${formatHours(totalHours)}

## Submission Summary
${submissionLines}

## Task Ownership Snapshot
${ownershipSnapshot}

## Remaining Risks
${remainingRisks || '- No active risk flags.'}
`
}
