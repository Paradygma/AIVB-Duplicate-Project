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
