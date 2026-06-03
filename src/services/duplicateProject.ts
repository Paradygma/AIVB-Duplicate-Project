import * as projectRepository from '../notion/projectRepository'
import * as externalCostRepository from '../notion/externalCostRepository'
import * as milestoneRepository from '../notion/milestoneRepository'
import * as taskRepository from '../notion/taskRepository'
import { logger } from '../utils/logger'
import { nextVersionName } from './versionName'

export type DuplicationResult = {
  sourceProjectId: string
  clonedProjectId: string
  clonedProjectUrl: string
  clonedProjectName: string
}

export class DuplicationAlreadyRunningError extends Error {
  override name = 'DuplicationAlreadyRunningError'
}

export async function duplicateProject(sourceProjectId: string): Promise<DuplicationResult> {
  const source = await projectRepository.getProject(sourceProjectId)
  if (projectRepository.selectName(source, 'Stato Duplicazione') === 'In corso') {
    throw new DuplicationAlreadyRunningError('Duplicazione gia in corso')
  }

  await projectRepository.setDuplicationInProgress(sourceProjectId)
  let phase = 'calculate_version'

  try {
    const names = await projectRepository.listProjectNames()
    const name = nextVersionName(projectRepository.titleText(source, 'Nome Progetto'), names)

    phase = 'create_project'
    const clonedProject = await projectRepository.createProject(name, source)

    phase = 'clone_external_costs'
    const costMap = new Map<string, string>()
    for (const cost of await externalCostRepository.listExternalCostsByProject(sourceProjectId)) {
      const cloned = await externalCostRepository.cloneExternalCost(cost, clonedProject.id)
      costMap.set(cost.id, cloned.id)
    }

    phase = 'clone_milestones'
    const milestoneMap = new Map<string, string>()
    for (const milestone of await milestoneRepository.listMilestonesByProject(sourceProjectId)) {
      const cloned = await milestoneRepository.cloneMilestone(milestone, clonedProject.id)
      milestoneMap.set(milestone.id, cloned.id)
    }

    phase = 'clone_tasks'
    const sourceTasks = await taskRepository.listTasksByProject(sourceProjectId)
    const taskMap = new Map<string, string>()
    for (const task of sourceTasks) {
      const cloned = await taskRepository.cloneTaskSkeleton(task, clonedProject.id)
      taskMap.set(task.id, cloned.id)
    }

    phase = 'rebuild_task_relations'
    for (const task of sourceTasks) {
      await taskRepository.updateTaskInternalRelations(taskMap.get(task.id)!, task, taskMap, milestoneMap)
    }

    await projectRepository.setDuplicationCompleted(sourceProjectId)
    logger.info('Project duplication completed', {
      sourceProjectId,
      clonedProjectId: clonedProject.id,
      costs: costMap.size,
      milestones: milestoneMap.size,
      tasks: taskMap.size,
    })
    return {
      sourceProjectId,
      clonedProjectId: clonedProject.id,
      clonedProjectUrl: clonedProject.url,
      clonedProjectName: name,
    }
  } catch (error) {
    const logMessage = `[${new Date().toISOString()}] Fase: ${phase}. Errore: ${safeErrorMessage(error)}`
    await projectRepository.setDuplicationError(sourceProjectId, logMessage).catch(() => {})
    logger.error('Project duplication failed', {
      sourceProjectId,
      phase,
      error: safeErrorMessage(error),
    })
    throw error
  }
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1500)
}
