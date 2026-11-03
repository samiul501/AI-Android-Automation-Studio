import { Router } from 'express'
import { resolve } from 'node:path'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { executionManager } from '../services/execution/manager.js'
import { buildHtmlReport } from '../services/reporting/htmlReport.js'
import { buildPdfReport } from '../services/reporting/pdfReport.js'
import { buildXlsxReport } from '../services/reporting/xlsxReport.js'
import { buildZipReport } from '../services/reporting/zipReport.js'

const SCREENSHOTS_DIR = resolve(process.cwd(), env.screenshotsDir)

type ReportFormat = 'html' | 'pdf' | 'xlsx' | 'json' | 'zip'

const CONTENT_TYPE: Record<ReportFormat, string> = {
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json',
  zip: 'application/zip',
}

function isReportFormat(value: string): value is ReportFormat {
  return value === 'html' || value === 'pdf' || value === 'xlsx' || value === 'json' || value === 'zip'
}

export const reportsRouter = Router()

// Every execution session is already reportable - this route lists the same
// sessions the Execution Engine persisted, just framed for the Reports panel.
reportsRouter.get('/reports', async (_req, res) => {
  res.json(await executionManager.list())
})

reportsRouter.get('/reports/:id/:format', async (req, res) => {
  const { id, format } = req.params
  if (!isReportFormat(format)) {
    res.status(400).json({ error: `Unsupported report format "${format}". Use one of: html, pdf, xlsx, json, zip` })
    return
  }

  const session = await executionManager.get(id)
  if (!session) {
    res.status(404).json({ error: 'Execution session not found' })
    return
  }

  try {
    let body: string | Buffer
    switch (format) {
      case 'html':
        body = buildHtmlReport(session)
        break
      case 'pdf':
        body = await buildPdfReport(session)
        break
      case 'xlsx':
        body = await buildXlsxReport(session)
        break
      case 'zip':
        body = await buildZipReport(session, SCREENSHOTS_DIR)
        break
      case 'json':
        body = JSON.stringify(session, null, 2)
        break
    }

    res.setHeader('Content-Type', CONTENT_TYPE[format])
    res.setHeader('Content-Disposition', `attachment; filename="report-${id}.${format}"`)
    res.send(body)
  } catch (error) {
    logger.error('Failed to generate report', { id, format, error: String(error) })
    res.status(500).json({ error: 'Failed to generate report' })
  }
})
