import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { env } from '../config/env'
import { notion } from './client'
import type { TaskExportRow } from './exportRepository'
import { queryAllPages } from './query'
import { withRetry } from './retry'

async function getActiveProjectsInPeriod(from: string, to: string): Promise<PageObjectResponse[]> {
  return queryAllPages(notion, env.NOTION_PROJECTS_DB_ID, {
    and: [
      {
        or: [
          { property: 'Status', status: { equals: 'In Progress' } },
          { property: 'Status', status: { equals: 'On Hold' } },
        ],
      },
      { property: 'Data Inizio', date: { on_or_before: to } },
      {
        or: [
          { property: 'Data Fine Prevista', date: { on_or_after: from } },
          { property: 'Data Fine Prevista', date: { is_empty: true } },
        ],
      },
    ],
  })
}

function pageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title') return prop.title.map((t) => t.plain_text).join('')
  }
  return ''
}

async function resolvePageTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const page = await withRetry(() => notion.pages.retrieve({ page_id: id }))
        if (page.object === 'page' && 'properties' in page) {
          return [id, pageTitle(page as PageObjectResponse)] as const
        }
      } catch {}
      return [id, ''] as const
    }),
  )
  return new Map(entries)
}

export async function getTasksForPeriodExport(from: string, to: string): Promise<TaskExportRow[]> {
  const projects = await getActiveProjectsInPeriod(from, to)

  const tasksByProject = await Promise.all(
    projects.map(async (project) => {
      const projectName = pageTitle(project)
      const tasks = await queryAllPages(notion, env.NOTION_TASKS_DB_ID, {
        property: 'Progetto',
        relation: { contains: project.id },
      })
      return { projectName, tasks }
    }),
  )

  const filtered: Array<{ projectName: string; task: PageObjectResponse }> = []

  for (const { projectName, tasks } of tasksByProject) {
    for (const task of tasks) {
      filtered.push({ projectName, task })
    }
  }

  const figuraIds: string[] = []
  const personaIds: string[] = []

  for (const { task } of filtered) {
    const figura = task.properties['Figura Professionale']
    if (figura?.type === 'relation') figuraIds.push(...figura.relation.map((r) => r.id))
    const persona = task.properties['Persona Allocata']
    if (persona?.type === 'relation') personaIds.push(...persona.relation.map((r) => r.id))
  }

  const [figuraMap, personaMap] = await Promise.all([
    resolvePageTitles(figuraIds),
    resolvePageTitles(personaIds),
  ])

  return filtered.map(({ projectName, task }): TaskExportRow => {
    const p = task.properties

    const nomeTask = p['Nome Task']
    const taskName = nomeTask?.type === 'title' ? nomeTask.title.map((t) => t.plain_text).join('') : ''

    const figura = p['Figura Professionale']
    const figuraProfessionale = figura?.type === 'relation'
      ? figura.relation.map((r) => figuraMap.get(r.id) ?? '').filter(Boolean).join(', ')
      : ''

    const persona = p['Persona Allocata']
    const personaAllocata = persona?.type === 'relation'
      ? persona.relation.map((r) => personaMap.get(r.id) ?? '').filter(Boolean).join(', ')
      : ''

    const dataInizioProp = p['Data Inizio']
    const dataInizio = dataInizioProp?.type === 'date' ? (dataInizioProp.date?.start ?? '') : ''

    const dataFineProp = p['Data Fine']
    const dataFine = dataFineProp?.type === 'formula' && dataFineProp.formula.type === 'date'
      ? (dataFineProp.formula.date?.start ?? '')
      : ''

    const durataProp = p['Durata Pianificata']
    const durataGiornate = durataProp?.type === 'number' ? durataProp.number : null

    const allocProp = p['% Allocazione Preventivata']
    const percentualeAllocazione = allocProp?.type === 'number' ? allocProp.number : null

    const costoProp = p['Costo Persona']
    const costoPersona = costoProp?.type === 'formula' && costoProp.formula.type === 'number'
      ? costoProp.formula.number
      : null

    const oreProp = p['Ore Effettive']
    const oreEffettive = oreProp?.type === 'rollup' && oreProp.rollup.type === 'number'
      ? oreProp.rollup.number
      : null

    const costoEffProp = p['Costo Effettivo Task']
    const costoEffettivoTask = costoEffProp?.type === 'rollup' && costoEffProp.rollup.type === 'number'
      ? costoEffProp.rollup.number
      : null

    return {
      projectName,
      taskName,
      figuraProfessionale,
      personaAllocata,
      dataInizio,
      dataFine,
      durataGiornate,
      percentualeAllocazione,
      costoPersona,
      oreEffettive,
      costoEffettivoTask,
    }
  })
}
