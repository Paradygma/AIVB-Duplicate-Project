import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { env } from '../config/env'
import { notion } from './client'
import { writableProperties } from './propertyMapper'
import { queryAllPages } from './query'
import { withRetry } from './retry'

const OMITTED_PROJECT_PROPERTIES = new Set([
  'Nome Progetto',
  'Task',
  'Milestone',
  'Costi Esterni',
  'stato duplicazione',
  'Log Duplicazione',
])
const DUPLICATION_STATUS_PROPERTY = 'Stato Duplicazione'

export async function getProject(pageId: string): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }))
  if (page.object !== 'page' || !('properties' in page)) {
    throw new Error('Record progetto non valido')
  }
  if (
    page.parent.type !== 'database_id'
    || normalizeId(page.parent.database_id) !== normalizeId(env.NOTION_PROJECTS_DB_ID)
  ) {
    throw new Error('Il pageId non appartiene al database Progetti - AIVB')
  }
  return page
}

export async function listProjectNames(): Promise<string[]> {
  const pages = await queryAllPages(notion, env.NOTION_PROJECTS_DB_ID)
  return pages.map((page) => titleText(page, 'Nome Progetto')).filter(Boolean)
}

export async function createProject(name: string, source: PageObjectResponse): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.create({
    parent: { database_id: env.NOTION_PROJECTS_DB_ID },
    properties: {
      ...writableProperties(source.properties, OMITTED_PROJECT_PROPERTIES),
      'Nome Progetto': { title: [{ text: { content: name } }] },
    } as never,
  }))
  return page as PageObjectResponse
}

export async function setDuplicationInProgress(pageId: string): Promise<void> {
  await updateDuplicationState(pageId, 'In corso', '')
}

export async function setDuplicationCompleted(pageId: string): Promise<void> {
  await updateDuplicationState(pageId, 'Completata', '')
}

export async function setDuplicationError(pageId: string, message: string): Promise<void> {
  await updateDuplicationState(pageId, 'Errore', message)
}

async function updateDuplicationState(pageId: string, state: string, log: string): Promise<void> {
  await withRetry(() => notion.pages.update({
    page_id: pageId,
    properties: {
      [DUPLICATION_STATUS_PROPERTY]: { select: { name: state } },
      'Log Duplicazione': { rich_text: log ? [{ text: { content: log } }] : [] },
    },
  }))
}

export function titleText(page: PageObjectResponse, propertyName: string): string {
  const property = page.properties[propertyName]
  return property?.type === 'title' ? property.title.map((item) => item.plain_text).join('') : ''
}

export function selectName(page: PageObjectResponse, propertyName: string): string | null {
  const property = page.properties[propertyName]
  return property?.type === 'select' ? property.select?.name ?? null : null
}

function normalizeId(id: string): string {
  return id.replace(/-/g, '')
}
