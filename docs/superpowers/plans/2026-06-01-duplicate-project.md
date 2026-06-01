# DuplicateProject Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Express microservice that clones a Notion project into the next `Vn` version while preserving shared historical relations and rebuilding cloned task, milestone, and external-cost relations.

**Architecture:** A small synchronous webhook service accepts a project page ID, validates the secret, acquires the Notion-level duplication guard, and delegates to an orchestration service. Focused repositories wrap Notion API calls; pure mapper and version-name modules contain the behavior that can be unit tested without network access.

**Tech Stack:** Node.js 20, TypeScript, Express, `@notionhq/client`, Zod, Vitest, Supertest.

---

## File Map

```text
package.json                         scripts and dependencies
tsconfig.json                        strict TypeScript compiler config
vitest.config.ts                     test environment setup
.gitignore                           generated and secret files
.env.example                         documented runtime configuration
src/index.ts                         Express entry point and /health
src/config/env.ts                    Zod-validated env vars
src/routes/webhook.ts                secret validation and webhook route
src/handlers/duplicateProjectHandler.ts HTTP-to-domain adapter
src/notion/client.ts                 Notion SDK singleton
src/notion/retry.ts                  retry for 429 and 5xx errors
src/notion/query.ts                  paginated database queries
src/notion/propertyMapper.ts         writable-property copy and relation remapping
src/notion/projectRepository.ts      project reads, creates, status updates
src/notion/taskRepository.ts         task reads, creates, relation updates
src/notion/milestoneRepository.ts    milestone reads and creates
src/notion/externalCostRepository.ts external cost reads and creates
src/services/versionName.ts          pure next-version naming logic
src/services/duplicateProject.ts     duplication orchestration
src/utils/logger.ts                  structured JSON logger
tests/versionName.test.ts            version naming tests
tests/setup.ts                       test-only environment variables
tests/propertyMapper.test.ts         writable-property and relation mapping tests
tests/retry.test.ts                  retry behavior tests
tests/duplicateProject.test.ts       orchestration tests with mocked repositories
tests/webhook.test.ts                route authentication and payload tests
```

## Task 1: Initialize The Service

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/config/env.ts`
- Create: `src/utils/logger.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Initialize Git**

Run:

```bash
git init
```

Expected: Git reports an initialized repository in `DuplicateProject`.

- [ ] **Step 2: Create package and compiler configuration**

Create `package.json`:

```json
{
  "name": "duplicate-project-aivb",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/src/index.js",
    "dev": "tsx watch --env-file=.env src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@notionhq/client": "^2.2.15",
    "express": "^4.19.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.15.7",
    "typescript": "^5.4.5",
    "vitest": "^2.1.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create Vitest environment setup**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
  },
})
```

Create `tests/setup.ts`:

```ts
process.env.NOTION_TOKEN = 'test-token'
process.env.WEBHOOK_SECRET = '12345678901234567890123456789012'
```

- [ ] **Step 4: Create runtime configuration**

Create `.gitignore`:

```text
node_modules/
dist/
.env
.DS_Store
coverage/
```

Create `.env.example`:

```text
PORT=3000
NOTION_TOKEN=secret_xxx
WEBHOOK_SECRET=replace-with-a-long-random-string
NOTION_PROJECTS_DB_ID=15de1529b88c4c8585f7fa99e40b2bc5
NOTION_TASKS_DB_ID=c81fe70015114faf9926085a112b3252
NOTION_MILESTONES_DB_ID=de6f34c8e3eb42fc93933e696542e4fe
NOTION_EXTERNAL_COSTS_DB_ID=358a3720c3fe4d12aa3f375154f1b558
```

Create `src/config/env.ts`:

```ts
import { z } from 'zod'

const schema = z.object({
  PORT: z.string().default('3000'),
  NOTION_TOKEN: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(32),
  NOTION_PROJECTS_DB_ID: z.string().default('15de1529b88c4c8585f7fa99e40b2bc5'),
  NOTION_TASKS_DB_ID: z.string().default('c81fe70015114faf9926085a112b3252'),
  NOTION_MILESTONES_DB_ID: z.string().default('de6f34c8e3eb42fc93933e696542e4fe'),
  NOTION_EXTERNAL_COSTS_DB_ID: z.string().default('358a3720c3fe4d12aa3f375154f1b558'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Missing env vars:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
```

Create `src/utils/logger.ts`:

```ts
const log = (level: string, msg: string, data?: unknown) => {
  const entry: Record<string, unknown> = { level, msg, ts: new Date().toISOString() }
  if (data !== undefined) entry.data = data
  console.log(JSON.stringify(entry))
}

export const logger = {
  info: (msg: string, data?: unknown) => log('info', msg, data),
  warn: (msg: string, data?: unknown) => log('warn', msg, data),
  error: (msg: string, data?: unknown) => log('error', msg, data),
}
```

- [ ] **Step 5: Create the Express entry point**

Create `src/index.ts`:

```ts
import './config/env'
import express from 'express'
import { env } from './config/env'
import { logger } from './utils/logger'

export const app = express()

app.use(express.json())
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

if (require.main === module) {
  app.listen(Number(env.PORT), () => logger.info(`Server running on port ${env.PORT}`))
}

export default app
```

- [ ] **Step 6: Install dependencies and run typecheck**

Run:

```bash
npm install
npm run typecheck
```

Expected: dependencies install and TypeScript exits with code `0`.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example package.json package-lock.json tsconfig.json vitest.config.ts tests/setup.ts src
git commit -m "chore: scaffold duplicate project service"
```

## Task 2: Add Version Naming With TDD

**Files:**
- Create: `tests/versionName.test.ts`
- Create: `src/services/versionName.ts`

- [ ] **Step 1: Write failing naming tests**

Create `tests/versionName.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { baseProjectName, nextVersionName } from '../src/services/versionName'

describe('baseProjectName', () => {
  it('removes a trailing version suffix only', () => {
    expect(baseProjectName('Progetto Alfa - V4')).toBe('Progetto Alfa')
    expect(baseProjectName('Progetto Vapore')).toBe('Progetto Vapore')
  })
})

describe('nextVersionName', () => {
  it('creates V2 for an unversioned project', () => {
    expect(nextVersionName('Progetto Alfa', ['Progetto Alfa'])).toBe('Progetto Alfa - V2')
  })

  it('uses the highest existing version plus one', () => {
    expect(nextVersionName('Progetto Alfa - V2', [
      'Progetto Alfa',
      'Progetto Alfa - V2',
      'Progetto Alfa - V4',
    ])).toBe('Progetto Alfa - V5')
  })

  it('ignores projects with a different base name', () => {
    expect(nextVersionName('Progetto Alfa', ['Progetto Beta - V9'])).toBe('Progetto Alfa - V2')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/versionName.test.ts
```

Expected: FAIL because `src/services/versionName.ts` does not exist.

- [ ] **Step 3: Implement naming**

Create `src/services/versionName.ts`:

```ts
const VERSION_SUFFIX = / - V(\d+)$/

export function baseProjectName(name: string): string {
  return name.replace(VERSION_SUFFIX, '')
}

export function nextVersionName(sourceName: string, existingNames: string[]): string {
  const base = baseProjectName(sourceName)
  const maxVersion = existingNames.reduce((max, candidate) => {
    if (baseProjectName(candidate) !== base) return max
    const match = candidate.match(VERSION_SUFFIX)
    return match ? Math.max(max, Number(match[1])) : max
  }, 1)

  return `${base} - V${maxVersion + 1}`
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/versionName.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/versionName.ts tests/versionName.test.ts
git commit -m "feat: calculate next project version name"
```

## Task 3: Add Retry And Pagination Utilities With TDD

**Files:**
- Create: `tests/retry.test.ts`
- Create: `src/notion/retry.ts`
- Create: `src/notion/query.ts`
- Create: `src/notion/client.ts`

- [ ] **Step 1: Write failing retry tests**

Create `tests/retry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { withRetry } from '../src/notion/retry'

describe('withRetry', () => {
  it('retries Notion 429 errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue('ok')
    await expect(withRetry(fn, { delaysMs: [0, 0, 0] })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry validation errors', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 })
    await expect(withRetry(fn, { delaysMs: [0, 0, 0] })).rejects.toEqual({ status: 400 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/retry.test.ts
```

Expected: FAIL because `src/notion/retry.ts` does not exist.

- [ ] **Step 3: Implement retry, client, and pagination**

Create `src/notion/retry.ts`:

```ts
import { logger } from '../utils/logger'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { delaysMs?: number[] } = {},
): Promise<T> {
  const delaysMs = options.delaysMs ?? [1000, 2000, 3000]
  let lastError: unknown

  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const status = (error as { status?: number }).status
      if (status !== 429 && !(status && status >= 500)) throw error
      logger.warn('Transient Notion API error', { status, attempt: attempt + 1 })
      await sleep(delaysMs[attempt])
    }
  }

  throw lastError
}
```

Create `src/notion/client.ts`:

```ts
import { Client } from '@notionhq/client'
import { env } from '../config/env'

export const notion = new Client({ auth: env.NOTION_TOKEN })
```

Create `src/notion/query.ts`:

```ts
import type { Client } from '@notionhq/client'
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { withRetry } from './retry'

export async function queryAllPages(
  notion: Client,
  databaseId: string,
  filter?: Parameters<Client['databases']['query']>[0]['filter'],
): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    const response = await withRetry(() => notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      filter,
    }))
    pages.push(...response.results.filter((page): page is PageObjectResponse =>
      page.object === 'page' && 'properties' in page,
    ))
    cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined
  } while (cursor)

  return pages
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/retry.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notion tests/retry.test.ts
git commit -m "feat: add resilient notion query utilities"
```

## Task 4: Add Writable Property Mappers With TDD

**Files:**
- Create: `tests/propertyMapper.test.ts`
- Create: `src/notion/propertyMapper.ts`

- [ ] **Step 1: Write failing mapper tests**

Create `tests/propertyMapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { remapRelations, writableProperties } from '../src/notion/propertyMapper'

describe('writableProperties', () => {
  it('copies writable values and omits formulas, rollups, buttons, and system fields', () => {
    const result = writableProperties({
      'Nome Task': { id: 'title', type: 'title', title: [{ type: 'text', text: { content: 'Analisi' } }] },
      'Ore Stimate': { id: 'hours', type: 'number', number: 8 },
      'Data Inizio': { id: 'start', type: 'date', date: { start: '2026-06-01', end: null, time_zone: null } },
      'Costo Persona': { id: 'formula', type: 'formula', formula: { type: 'number', number: 10 } },
      'Created time': { id: 'created', type: 'created_time', created_time: '2026-06-01T10:00:00.000Z' },
      'Chiudi e traccia': { id: 'button', type: 'button', button: {} },
    } as never)

    expect(result).toEqual({
      'Nome Task': { title: [{ type: 'text', text: { content: 'Analisi' } }] },
      'Ore Stimate': { number: 8 },
      'Data Inizio': { date: { start: '2026-06-01', end: null, time_zone: null } },
    })
  })
})

describe('remapRelations', () => {
  it('replaces source IDs and drops relations outside the cloned set', () => {
    expect(remapRelations([{ id: 'old-a' }, { id: 'old-x' }], new Map([
      ['old-a', 'new-a'],
    ]))).toEqual([{ id: 'new-a' }])
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/propertyMapper.test.ts
```

Expected: FAIL because `src/notion/propertyMapper.ts` does not exist.

- [ ] **Step 3: Implement mapper**

Create `src/notion/propertyMapper.ts` with:

```ts
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

type Property = PageObjectResponse['properties'][string]
type WritableProperties = Record<string, unknown>

const OMITTED_TYPES = new Set([
  'button', 'created_by', 'created_time', 'formula', 'last_edited_by',
  'last_edited_time', 'rollup', 'unique_id', 'verification',
])

export function writableProperties(
  properties: PageObjectResponse['properties'],
  omittedNames: Set<string> = new Set(),
): WritableProperties {
  return Object.fromEntries(Object.entries(properties).flatMap(([name, property]) => {
    if (omittedNames.has(name) || OMITTED_TYPES.has(property.type)) return []
    const value = writableProperty(property)
    return value === undefined ? [] : [[name, value]]
  }))
}

function writableProperty(property: Property): unknown {
  switch (property.type) {
    case 'title': return { title: property.title }
    case 'rich_text': return { rich_text: property.rich_text }
    case 'number': return { number: property.number }
    case 'select': return { select: property.select }
    case 'multi_select': return { multi_select: property.multi_select }
    case 'status': return { status: property.status }
    case 'date': return { date: property.date }
    case 'checkbox': return { checkbox: property.checkbox }
    case 'url': return { url: property.url }
    case 'email': return { email: property.email }
    case 'phone_number': return { phone_number: property.phone_number }
    case 'people': return { people: property.people.map(({ id }) => ({ id })) }
    case 'relation': return { relation: property.relation.map(({ id }) => ({ id })) }
    default: return undefined
  }
}

export function remapRelations(
  relations: Array<{ id: string }>,
  idMap: Map<string, string>,
): Array<{ id: string }> {
  return relations.flatMap(({ id }) => {
    const mappedId = idMap.get(id)
    return mappedId ? [{ id: mappedId }] : []
  })
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/propertyMapper.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notion/propertyMapper.ts tests/propertyMapper.test.ts
git commit -m "feat: copy writable notion properties"
```

## Task 5: Add Notion Repositories

**Files:**
- Create: `src/notion/projectRepository.ts`
- Create: `src/notion/taskRepository.ts`
- Create: `src/notion/milestoneRepository.ts`
- Create: `src/notion/externalCostRepository.ts`

- [ ] **Step 1: Create project repository**

Create `src/notion/projectRepository.ts`:

```ts
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

export async function getProject(pageId: string): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }))
  if (page.object !== 'page' || !('properties' in page)) throw new Error('Record progetto non valido')
  if (page.parent.type !== 'database_id' || page.parent.database_id.replace(/-/g, '') !== env.NOTION_PROJECTS_DB_ID.replace(/-/g, '')) {
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
      'stato duplicazione': { select: { name: state } },
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
```

- [ ] **Step 2: Create external-cost repository**

Create `src/notion/externalCostRepository.ts`:

```ts
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

export async function cloneExternalCost(source: PageObjectResponse, newProjectId: string): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.create({
    parent: { database_id: env.NOTION_EXTERNAL_COSTS_DB_ID },
    properties: {
      ...writableProperties(source.properties, new Set(['Progetto'])),
      Progetto: { relation: [{ id: newProjectId }] },
    } as never,
  }))
  return page as PageObjectResponse
}
```

- [ ] **Step 3: Create milestone repository**

Create `src/notion/milestoneRepository.ts`:

```ts
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { env } from '../config/env'
import { notion } from './client'
import { writableProperties } from './propertyMapper'
import { queryAllPages } from './query'
import { withRetry } from './retry'

export function listMilestonesByProject(projectId: string): Promise<PageObjectResponse[]> {
  return queryAllPages(notion, env.NOTION_MILESTONES_DB_ID, {
    property: 'Progetto',
    relation: { contains: projectId },
  })
}

export async function cloneMilestone(source: PageObjectResponse, newProjectId: string): Promise<PageObjectResponse> {
  const page = await withRetry(() => notion.pages.create({
    parent: { database_id: env.NOTION_MILESTONES_DB_ID },
    properties: {
      ...writableProperties(source.properties, new Set(['Task', 'Progetto'])),
      Progetto: { relation: [{ id: newProjectId }] },
    } as never,
  }))
  return page as PageObjectResponse
}
```

- [ ] **Step 4: Create task repository**

Create `src/notion/taskRepository.ts`:

```ts
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

export async function cloneTaskSkeleton(source: PageObjectResponse, newProjectId: string): Promise<PageObjectResponse> {
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
```

- [ ] **Step 5: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/notion
git commit -m "feat: add notion duplication repositories"
```

## Task 6: Add Duplication Orchestrator With TDD

**Files:**
- Create: `tests/duplicateProject.test.ts`
- Create: `src/services/duplicateProject.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `tests/duplicateProject.test.ts`:

```ts
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
    vi.mocked(projects.getProject).mockResolvedValue(page('source', {
      'Nome Progetto': { type: 'title', title: [{ plain_text: 'Alfa' }] },
      'stato duplicazione': { type: 'select', select: null },
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
      'stato duplicazione': { type: 'select', select: { name: 'In corso' } },
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/duplicateProject.test.ts
```

Expected: FAIL because `src/services/duplicateProject.ts` does not exist.

- [ ] **Step 3: Implement orchestration**

Create `src/services/duplicateProject.ts`:

```ts
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

export class DuplicationAlreadyRunningError extends Error {}

export async function duplicateProject(sourceProjectId: string): Promise<DuplicationResult> {
  const source = await projectRepository.getProject(sourceProjectId)
  if (projectRepository.selectName(source, 'stato duplicazione') === 'In corso') {
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
    logger.info('Project duplication completed', { sourceProjectId, clonedProjectId: clonedProject.id })
    return {
      sourceProjectId,
      clonedProjectId: clonedProject.id,
      clonedProjectUrl: clonedProject.url,
      clonedProjectName: name,
    }
  } catch (error) {
    const logMessage = `[${new Date().toISOString()}] Fase: ${phase}. Errore: ${safeErrorMessage(error)}`
    await projectRepository.setDuplicationError(sourceProjectId, logMessage).catch(() => {})
    logger.error('Project duplication failed', { sourceProjectId, phase, error: safeErrorMessage(error) })
    throw error
  }
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1500)
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/duplicateProject.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/duplicateProject.ts tests/duplicateProject.test.ts
git commit -m "feat: orchestrate project duplication"
```

## Task 7: Add Authenticated Webhook With TDD

**Files:**
- Create: `tests/webhook.test.ts`
- Create: `src/handlers/duplicateProjectHandler.ts`
- Create: `src/routes/webhook.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing webhook tests**

Create `tests/webhook.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../src/handlers/duplicateProjectHandler', () => ({ runDuplicateProject: vi.fn() }))

describe('POST /webhook/duplicate-project', () => {
  let app: typeof import('../src/index').app
  let runDuplicateProject: typeof import('../src/handlers/duplicateProjectHandler').runDuplicateProject

  beforeAll(async () => {
    app = (await import('../src/index')).app
    runDuplicateProject = (await import('../src/handlers/duplicateProjectHandler')).runDuplicateProject
  })

  beforeEach(() => vi.mocked(runDuplicateProject).mockReset())

  it('returns 401 without X-Webhook-Secret', async () => {
    await request(app).post('/webhook/duplicate-project').send({ pageId: 'source' }).expect(401)
  })

  it('returns 401 with an invalid secret', async () => {
    await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', 'wrong')
      .send({ pageId: 'source' })
      .expect(401)
  })

  it('returns 400 without pageId', async () => {
    await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', process.env.WEBHOOK_SECRET!)
      .send({})
      .expect(400)
  })

  it('returns 200 with the cloned project result', async () => {
    vi.mocked(runDuplicateProject).mockResolvedValue({
      sourceProjectId: 'source',
      clonedProjectId: 'clone',
      clonedProjectUrl: 'https://notion.so/clone',
      clonedProjectName: 'Alfa - V2',
    })
    const response = await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', process.env.WEBHOOK_SECRET!)
      .send({ pageId: 'source' })
      .expect(200)
    expect(response.body.clonedProjectId).toBe('clone')
  })

  it('returns 409 when duplication is already running', async () => {
    const { DuplicationAlreadyRunningError } = await import('../src/services/duplicateProject')
    vi.mocked(runDuplicateProject).mockRejectedValue(new DuplicationAlreadyRunningError('Duplicazione gia in corso'))
    await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', process.env.WEBHOOK_SECRET!)
      .send({ pageId: 'source' })
      .expect(409)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/webhook.test.ts
```

Expected: FAIL because the webhook route does not exist.

- [ ] **Step 3: Implement handler and route**

Create `src/handlers/duplicateProjectHandler.ts`:

```ts
import { duplicateProject } from '../services/duplicateProject'

export async function runDuplicateProject(pageId: string) {
  return duplicateProject(pageId)
}
```

Create `src/routes/webhook.ts`:

```ts
import { timingSafeEqual } from 'crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { runDuplicateProject } from '../handlers/duplicateProjectHandler'
import { DuplicationAlreadyRunningError } from '../services/duplicateProject'
import { logger } from '../utils/logger'

const router = Router()
const payloadSchema = z.object({ pageId: z.string().min(1) })

function verifySecret(req: Request, res: Response): boolean {
  const provided = req.headers['x-webhook-secret']
  if (typeof provided !== 'string') {
    res.status(401).json({ error: 'Missing X-Webhook-Secret header' })
    return false
  }
  const a = Buffer.from(provided)
  const b = Buffer.from(env.WEBHOOK_SECRET)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid secret' })
    return false
  }
  return true
}

router.post('/duplicate-project', async (req, res) => {
  if (!verifySecret(req, res)) return
  const parsed = payloadSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    return
  }
  try {
    res.status(200).json(await runDuplicateProject(parsed.data.pageId))
  } catch (error) {
    if (error instanceof DuplicationAlreadyRunningError) {
      res.status(409).json({ error: error.message })
      return
    }
    logger.error('Unhandled duplication error', { pageId: parsed.data.pageId, error: String(error) })
    res.status(500).json({ error: 'Duplication failed' })
  }
})

export { router as webhookRouter }
```

Modify `src/index.ts`:

```ts
import { webhookRouter } from './routes/webhook'
app.use('/webhook', webhookRouter)
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/webhook.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/webhook.test.ts
git commit -m "feat: expose duplicate project webhook"
```

## Task 8: Add Documentation And Verify The Build

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write operational documentation**

Create `README.md` containing:

````markdown
# DuplicateProject - AIVB

Microservizio TypeScript/Express che duplica un progetto Notion creando la
successiva versione `Vn`.

## Flusso

```text
Pulsante Notion
-> POST /webhook/duplicate-project
-> copia progetto
-> copia costi esterni
-> copia milestone
-> copia task
-> ricostruzione gerarchia e dipendenze task
```

## Setup

```bash
npm install
cp .env.example .env
```

Compila `.env` senza commettere il file:

```text
NOTION_TOKEN=secret_xxx
WEBHOOK_SECRET=<stringa-random-di-almeno-32-caratteri>
```

Condividi con l'integrazione Notion i database:

```text
Progetti - AIVB
Task - AIVB
Milestone - AIVB
Costi Esterni - AIVB
```

## Automazione Notion

Configura il pulsante nel database `Progetti - AIVB`:

```text
POST https://<host>/webhook/duplicate-project
X-Webhook-Secret: <WEBHOOK_SECRET>
Content-Type: application/json
```

Body:

```json
{
  "pageId": "{{trigger.page_id}}"
}
```

Il database `Progetti - AIVB` deve contenere:

```text
stato duplicazione: select con In corso, Completata, Errore
Log Duplicazione: text
```

## Sviluppo

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

Test manuale:

```bash
curl -X POST http://localhost:3000/webhook/duplicate-project \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"pageId":"<test-project-page-id>"}'
```

## Limite Noto

Il controllo `stato duplicazione = In corso` riduce i clic duplicati, ma non e
un lock distribuito atomico tra piu istanze serverless.

## Dry Run

Verifica con un progetto contenente due milestone, task padre e sotto-task, una
dipendenza `Blocked by`, un costo esterno e almeno una relazione condivisa.
Controlla che modificare task e costi della nuova versione non modifichi il
progetto sorgente.
````
```

- [ ] **Step 2: Run the complete verification suite**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests PASS, typecheck exits `0`, build exits `0`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add duplicate project setup guide"
```

## Task 9: Perform The Manual Dry Run

**Files:**
- No code changes expected.

- [ ] **Step 1: Configure runtime secrets locally or in the deployment platform**

Set:

```text
NOTION_TOKEN
WEBHOOK_SECRET
```

Do not commit `.env`.

- [ ] **Step 2: Give the Notion integration access**

Ensure the integration can access:

```text
Progetti - AIVB
Task - AIVB
Milestone - AIVB
Costi Esterni - AIVB
```

- [ ] **Step 3: Create a representative test project**

Create a project with:

```text
- two milestones
- one parent task and one sub-task
- one Blocked by dependency
- one external cost
- one shared customer
- one shared quote
- one shared professional figure and allocated person
- one shared historical record
```

- [ ] **Step 4: Trigger duplication**

Run against the local service or press the configured Notion button:

```bash
curl -X POST http://localhost:3000/webhook/duplicate-project \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"pageId":"<test-project-page-id>"}'
```

Expected:

```text
- HTTP 200
- source stato duplicazione = Completata
- new project named <base> - V2
- cloned task, milestone, and external cost records
- shared quote, customer, history, professional figure, and person records
```

- [ ] **Step 5: Verify isolation**

Modify a cloned task and cloned external cost.

Expected: source task and source cost remain unchanged.

- [ ] **Step 6: Verify duplicate-click blocking**

Temporarily set source `stato duplicazione` to `In corso`, trigger again, then
restore the value.

Expected: HTTP `409` and no new project.

- [ ] **Step 7: Record dry-run outcome**

Append a short dated result to `README.md` only if the project should preserve
operational verification history. Otherwise record it in the deployment notes.
