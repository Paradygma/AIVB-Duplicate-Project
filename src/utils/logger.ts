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
