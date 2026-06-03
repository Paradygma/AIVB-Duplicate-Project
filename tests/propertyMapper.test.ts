import { describe, expect, it } from 'vitest'
import { remapRelations, writableProperties } from '../src/notion/propertyMapper'

describe('writableProperties', () => {
  it('copies writable values and omits formulas, rollups, buttons, and system fields', () => {
    const result = writableProperties({
      'Nome Task': { id: 'title', type: 'title', title: [{ type: 'text', text: { content: 'Analisi' } }] },
      'Ore Stimate': { id: 'hours', type: 'number', number: 8 },
      'Data Inizio': { id: 'start', type: 'date', date: { start: '2026-06-01', end: null, time_zone: null } },
      'Costo Persona': { id: 'formula', type: 'formula', formula: { type: 'number', number: 10 } },
      'Created time': { id: 'created', type: 'created_time', created_time: '2026-06-01T10:00:00.000Z' },
      'Chiudi e traccia': { id: 'button', type: 'button', button: {} },
    } as never)

    expect(result).toEqual({
      'Nome Task': { title: [{ type: 'text', text: { content: 'Analisi' } }] },
      'Ore Stimate': { number: 8 },
      'Data Inizio': { date: { start: '2026-06-01', end: null, time_zone: null } },
    })
  })
})

describe('remapRelations', () => {
  it('replaces source IDs and drops relations outside the cloned set', () => {
    expect(remapRelations([{ id: 'old-a' }, { id: 'old-x' }], new Map([
      ['old-a', 'new-a'],
    ]))).toEqual([{ id: 'new-a' }])
  })
})
