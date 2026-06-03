import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { env } from '../config/env'
import { notion } from './client'
import { writableProperties } from './propertyMapper'
import { queryAllPages } from './query'
import { withRetry } from './retry'

export function listExternalCostsByProject(projectId: string): Promise<PageObjectResponse[]> {
  return queryAllPages(notion, env.NOTION_EXTERNAL_COSTS_DB_ID, {
    property: 'Progetto',
    relation: { contains: projectId },
  })
}

export async function cloneExternalCost(
  source: PageObjectResponse,
  newProjectId: string,
): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.create({
    parent: { database_id: env.NOTION_EXTERNAL_COSTS_DB_ID },
    properties: {
      ...writableProperties(source.properties, new Set(['Progetto'])),
      Progetto: { relation: [{ id: newProjectId }] },
    } as never,
  }))
  return page as PageObjectResponse
}
