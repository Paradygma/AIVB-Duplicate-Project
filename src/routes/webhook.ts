import { timingSafeEqual } from 'crypto'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { runDuplicateProject } from '../handlers/duplicateProjectHandler'
import { DuplicationAlreadyRunningError } from '../services/duplicateProject'
import { logger } from '../utils/logger'

const payloadSchema = z.any().transform((value, ctx) => {
  const pageId = value?.pageId ?? value?.data?.id
  if (typeof pageId !== 'string' || pageId.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing pageId or data.id in webhook payload',
    })
    return z.NEVER
  }
  return { pageId }
})
type DuplicateProjectRunner = typeof runDuplicateProject

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

export function createWebhookRouter(runDuplicate: DuplicateProjectRunner = runDuplicateProject) {
  const router = Router()
  router.post('/duplicate-project', (req, res) => {
    if (!verifySecret(req, res)) return
    const parsed = payloadSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
      return
    }
    void Promise.resolve()
      .then(() => runDuplicate(parsed.data.pageId))
      .then((result) => res.status(200).json(result))
      .catch((error: unknown) => respondWithDuplicationError(res, parsed.data.pageId, error))
  })
  return router
}

export const webhookRouter = createWebhookRouter()

function respondWithDuplicationError(res: Response, pageId: string, error: unknown): void {
  if (
    error instanceof DuplicationAlreadyRunningError
    || (error instanceof Error && error.name === 'DuplicationAlreadyRunningError')
  ) {
    res.status(409).json({ error: error.message })
    return
  }
  logger.error('Unhandled duplication error', { pageId, error: String(error) })
  res.status(500).json({ error: 'Duplication failed' })
}
