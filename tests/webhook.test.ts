import express from 'express'
import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { DuplicationAlreadyRunningError } from '../src/services/duplicateProject'
import type { DuplicationResult } from '../src/services/duplicateProject'
import { createWebhookRouter } from '../src/routes/webhook'

const successResult: DuplicationResult = {
  sourceProjectId: 'source',
  clonedProjectId: 'clone',
  clonedProjectUrl: 'https://notion.so/clone',
  clonedProjectName: 'Alfa - V2',
}

describe('POST /webhook/duplicate-project', () => {
  let runDuplicateProject: (pageId: string) => Promise<DuplicationResult>
  const app = express()

  app.use(express.json())
  app.use('/webhook', createWebhookRouter((pageId) => runDuplicateProject(pageId)))

  beforeEach(() => {
    runDuplicateProject = async () => successResult
  })

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

  it('accepts the native Notion data.id payload', async () => {
    const response = await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', process.env.WEBHOOK_SECRET!)
      .send({ data: { id: 'source' } })
      .expect(200)
    expect(response.body.clonedProjectId).toBe('clone')
  })

  it('returns 200 with the cloned project result', async () => {
    const response = await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', process.env.WEBHOOK_SECRET!)
      .send({ pageId: 'source' })
      .expect(200)
    expect(response.body.clonedProjectId).toBe('clone')
  })

  it('returns 409 when duplication is already running', async () => {
    runDuplicateProject = async () => {
      throw new DuplicationAlreadyRunningError('Duplicazione gia in corso')
    }
    await request(app).post('/webhook/duplicate-project')
      .set('X-Webhook-Secret', process.env.WEBHOOK_SECRET!)
      .send({ pageId: 'source' })
      .expect(409)
  })
})
