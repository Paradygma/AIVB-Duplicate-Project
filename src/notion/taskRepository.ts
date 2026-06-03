import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { env } from '../config/env'
import { notion } from './client'
import { remapRelations, writableProperties } from './propertyMapper'
import { queryAllPages } from './query'
import { withRetry } from './retry'

const INTERNAL_RELATIONS = ['Milestone', 'Parent item', 'Sub-item', 'Blocked by', 'Blocking']

export function listTasksByProject(projectId: string): Promise<PageObjectResponse[]> {
  return queryAllPages(notion, env.NOTION_TASKS_DB_ID, {
    property: 'Progetto',
    relation: { contains: projectId },
  })
}

export async function cloneTaskSkeleton(
  source: PageObjectResponse,
  newProjectId: string,
): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.create({
    parent: { database_id: env.NOTION_TASKS_DB_ID },
    properties: {
      ...writableProperties(source.properties, new Set([...INTERNAL_RELATIONS, 'Progetto'])),
      Progetto: { relation: [{ id: newProjectId }] },
    } as never,
  }))
  return page as PageObjectResponse
}

export async function updateTaskInternalRelations(
  clonedTaskId: string,
  source: PageObjectResponse,
  taskMap: Map<string, string>,
  milestoneMap: Map<string, string>,
): Promise<void> {
  const properties = Object.fromEntries(INTERNAL_RELATIONS.map((name) => {
    const property = source.properties[name]
    const idMap = name === 'Milestone' ? milestoneMap : taskMap
    const sourceRelations = property?.type === 'relation' ? property.relation : []
    return [name, { relation: remapRelations(sourceRelations, idMap) }]
  }))

  await withRetry(() => notion.pages.update({ page_id: clonedTaskId, properties }))
}
