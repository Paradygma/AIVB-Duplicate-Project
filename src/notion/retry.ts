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
