import { parse as parseCsv } from 'csv-parse/sync'
import ExcelJS, { type CellValue } from 'exceljs'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import type { ParsedDocument, SupportedDocumentType } from './types.js'

// Capped so a huge upload doesn't blow past the model's context window or
// balloon token cost - mirrors the MAX_LOG_LINES capping precedent in the
// failure-analysis prompt builder.
const MAX_TEXT_LENGTH = 60_000

const EXTENSION_MAP: Record<string, SupportedDocumentType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.csv': 'csv',
  '.txt': 'txt',
  '.md': 'md',
  '.json': 'json',
}

export class UnsupportedDocumentTypeError extends Error {
  constructor(extension: string) {
    super(`Unsupported document type "${extension}". Supported types: ${Object.keys(EXTENSION_MAP).join(', ')}`)
  }
}

export function detectDocumentType(fileName: string): SupportedDocumentType {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  const documentType = EXTENSION_MAP[extension]
  if (!documentType) throw new UnsupportedDocumentTypeError(extension)
  return documentType
}

function cap(text: string): { text: string; truncated: boolean; fullTextLength: number } {
  const fullTextLength = text.length
  if (fullTextLength <= MAX_TEXT_LENGTH) return { text, truncated: false, fullTextLength }
  return { text: text.slice(0, MAX_TEXT_LENGTH), truncated: true, fullTextLength }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return String(value.result ?? '')
  }
  return String(value)
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  // exceljs's own .d.ts declares a broken ambient `Buffer extends ArrayBuffer`
  // shim that collides with @types/node's real (generic) Buffer - a known
  // upstream typing bug, not a real type mismatch, hence the narrow cast.
  await workbook.xlsx.load(buffer as never)

  const sections: string[] = []
  for (const sheet of workbook.worksheets) {
    const lines: string[] = [`## Sheet: ${sheet.name}`]
    sheet.eachRow((row) => {
      const cells = Array.isArray(row.values) ? row.values.slice(1) : []
      const rendered = cells.map(cellToString).join(' | ')
      if (rendered.trim().length > 0) lines.push(rendered)
    })
    sections.push(lines.join('\n'))
  }
  return sections.join('\n\n')
}

function extractCsvText(raw: string): string {
  const records = parseCsv(raw, { skip_empty_lines: true }) as string[][]
  return records.map((row) => row.join(' | ')).join('\n')
}

function extractJsonText(raw: string): string {
  // Parse-then-restringify both validates the upload is genuinely valid JSON
  // and normalizes formatting for the AI prompt.
  return JSON.stringify(JSON.parse(raw), null, 2)
}

export async function parseDocument(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const documentType = detectDocumentType(fileName)

  let text: string
  switch (documentType) {
    case 'pdf':
      text = await extractPdfText(buffer)
      break
    case 'docx':
      text = await extractDocxText(buffer)
      break
    case 'xlsx':
      text = await extractXlsxText(buffer)
      break
    case 'csv':
      text = extractCsvText(buffer.toString('utf-8'))
      break
    case 'json':
      text = extractJsonText(buffer.toString('utf-8'))
      break
    case 'txt':
    case 'md':
      text = buffer.toString('utf-8')
      break
  }

  const { text: capped, truncated, fullTextLength } = cap(text)
  return { documentType, text: capped, truncated, fullTextLength }
}
