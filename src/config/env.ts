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
