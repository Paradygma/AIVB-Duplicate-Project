import type { TaskExportRow } from '../notion/exportRepository'

const HEADERS = [
  'Nome Progetto',
  'Nome Attività',
  'Figura Professionale',
  'Risorsa Associata',
  'Data Inizio',
  'Data Fine',
  'Giornate Stimate',
  '% Allocazione',
  'Costo Giornate Stimate',
  'Ore Consuntivate',
  'Costo Giornate Consuntivate',
]

function cell(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return str.includes(';') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

export function generateCsv(rows: TaskExportRow[]): string {
  const lines = [HEADERS.join(';')]
  for (const row of rows) {
    lines.push([
      cell(row.projectName),
      cell(row.taskName),
      cell(row.figuraProfessionale),
      cell(row.personaAllocata),
      cell(row.dataInizio),
      cell(row.dataFine),
      cell(row.durataGiornate),
      cell(row.percentualeAllocazione),
      cell(row.costoPersona),
      cell(row.oreEffettive),
      cell(row.costoEffettivoTask),
    ].join(';'))
  }
  return '﻿' + lines.join('\n')
}
