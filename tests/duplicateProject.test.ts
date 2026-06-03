import { beforeEach, describe, expect, it, vi } from 'vitest'
import { duplicateProject, DuplicationAlreadyRunningError } from '../src/services/duplicateProject'
import * as projects from '../src/notion/projectRepository'
import * as costs from '../src/notion/externalCostRepository'
import * as milestones from '../src/notion/milestoneRepository'
import * as tasks from '../src/notion/taskRepository'

vi.mock('../src/notion/projectRepository')
vi.mock('../src/notion/externalCostRepository')
vi.mock('../src/notion/milestoneRepository')
vi.mock('../src/notion/taskRepository')

const page = (id: string, properties: Record<string, unknown> = {}) => ({
  id,
  url: `https://notion.so/${id}`,
  properties,
}) as never

describe('duplicateProject', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(projects.titleText).mockImplementation((project, propertyName) => {
      const property = project.properties[propertyName]
      return property?.type === 'title' ? property.title.map((item) => item.plain_text).join('') : ''
    })
    vi.mocked(projects.selectName).mockImplementation((project, propertyName) => {
      const property = project.properties[propertyName]
      return property?.type === 'select' ? property.select?.name ?? null : null
    })
    vi.mocked(projects.setDuplicationInProgress).mockResolvedValue()
    vi.mocked(projects.setDuplicationCompleted).mockResolvedValue()
    vi.mocked(projects.setDuplicationError).mockResolvedValue()
    vi.mocked(tasks.updateTaskInternalRelations).mockResolvedValue()
    vi.mocked(projects.getProject).mockResolvedValue(page('source', {
      'Nome Progetto': { type: 'title', title: [{ plain_text: 'Alfa' }] },
      'Stato Duplicazione': { type: 'select', select: null },
    }))
    vi.mocked(projects.listProjectNames).mockResolvedValue(['Alfa'])
    vi.mocked(projects.createProject).mockResolvedValue(page('project-v2'))
    vi.mocked(costs.listExternalCostsByProject).mockResolvedValue([page('cost')])
    vi.mocked(costs.cloneExternalCost).mockResolvedValue(page('cost-v2'))
    vi.mocked(milestones.listMilestonesByProject).mockResolvedValue([page('milestone')])
    vi.mocked(milestones.cloneMilestone).mockResolvedValue(page('milestone-v2'))
    vi.mocked(tasks.listTasksByProject).mockResolvedValue([page('task')])
    vi.mocked(tasks.cloneTaskSkeleton).mockResolvedValue(page('task-v2'))
  })

  it('clones planning data and rebuilds task relations', async () => {
    await expect(duplicateProject('source')).resolves.toMatchObject({
      sourceProjectId: 'source',
      clonedProjectId: 'project-v2',
      clonedProjectName: 'Alfa - V2',
    })
    expect(costs.cloneExternalCost).toHaveBeenCalledWith(expect.objectContaining({ id: 'cost' }), 'project-v2')
    expect(milestones.cloneMilestone).toHaveBeenCalledWith(expect.objectContaining({ id: 'milestone' }), 'project-v2')
    expect(tasks.cloneTaskSkeleton).toHaveBeenCalledWith(expect.objectContaining({ id: 'task' }), 'project-v2')
    expect(tasks.updateTaskInternalRelations).toHaveBeenCalledWith(
      'task-v2',
      expect.objectContaining({ id: 'task' }),
      new Map([['task', 'task-v2']]),
      new Map([['milestone', 'milestone-v2']]),
    )
    expect(projects.setDuplicationCompleted).toHaveBeenCalledWith('source')
  })

  it('rejects a project already marked In corso', async () => {
    vi.mocked(projects.getProject).mockResolvedValue(page('source', {
      'Stato Duplicazione': { type: 'select', select: { name: 'In corso' } },
    }))
    await expect(duplicateProject('source')).rejects.toBeInstanceOf(DuplicationAlreadyRunningError)
    expect(projects.createProject).not.toHaveBeenCalled()
  })

  it('sets Errore and Log Duplicazione when cloning fails', async () => {
    vi.mocked(tasks.cloneTaskSkeleton).mockRejectedValue(new Error('Notion unavailable'))
    await expect(duplicateProject('source')).rejects.toThrow('Notion unavailable')
    expect(projects.setDuplicationError).toHaveBeenCalledWith(
      'source',
      expect.stringContaining('Fase: clone_tasks. Errore: Notion unavailable'),
    )
    expect(projects.setDuplicationCompleted).not.toHaveBeenCalled()
  })
})
