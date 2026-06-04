import { timingSafeEqual } from 'crypto'
import type { Request, Response } from 'express'
import { env } from '../config/env'

export function verifySecret(req: Request, res: Response): boolean {
  const provided = req.headers['x-webhook-secret'] ?? req.query['secret']
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
