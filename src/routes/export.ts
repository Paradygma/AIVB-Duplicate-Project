import { Router, type Request, type Response } from 'express'
import { getTasksForExport } from '../notion/exportRepository'
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
