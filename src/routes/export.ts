import { Router, type Request, type Response } from 'express'
import { getTasksForExport } from '../notion/exportRepository'
import { getTasksForPeriodExport } from '../notion/periodExportRepository'
import { getProject, titleText } from '../notion/projectRepository'
import { generateCsv } from '../services/exportCsv'
import { verifySecret } from '../utils/auth'
import { logger } from '../utils/logger'

export const exportRouter = Router()

exportRouter.get('/project/:projectId', async (req: Request, res: Response) => {
  if (!verifySecret(req, res)) return

  const { projectId } = req.params

  try {
    const project = await getProject(projectId)
    const projectName = titleText(project, 'Nome Progetto')
    const rows = await getTasksForExport(projectId, projectName)
    const csv = generateCsv(rows)
    const filename = `${projectName.replace(/[^\w\s-]/g, '_')}_export.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (error) {
    logger.error('Export failed', { projectId, error: String(error) })
    res.status(500).json({ error: 'Export failed' })
  }
})

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

exportRouter.get('/period', async (req: Request, res: Response) => {
  if (!verifySecret(req, res)) return

  const { from, to } = req.query

  if (typeof from !== 'string' || !ISO_DATE.test(from) || typeof to !== 'string' || !ISO_DATE.test(to)) {
    res.status(400).json({ error: 'Params from and to required in YYYY-MM-DD format' })
    return
  }

  if (from > to) {
    res.status(400).json({ error: 'from must be before or equal to to' })
    return
  }

  try {
    const rows = await getTasksForPeriodExport(from, to)
    const csv = generateCsv(rows)
    const filename = `periodo_${from}_${to}_export.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (error) {
    logger.error('Period export failed', { from, to, error: String(error) })
    res.status(500).json({ error: 'Export failed' })
  }
})
