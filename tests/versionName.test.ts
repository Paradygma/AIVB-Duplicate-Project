import { describe, expect, it } from 'vitest'
import { baseProjectName, nextVersionName } from '../src/services/versionName'

describe('baseProjectName', () => {
  it('removes a trailing version suffix only', () => {
    expect(baseProjectName('Progetto Alfa - V4')).toBe('Progetto Alfa')
    expect(baseProjectName('Progetto Vapore')).toBe('Progetto Vapore')
  })
})

describe('nextVersionName', () => {
  it('creates V2 for an unversioned project', () => {
    expect(nextVersionName('Progetto Alfa', ['Progetto Alfa'])).toBe('Progetto Alfa - V2')
  })

  it('uses the highest existing version plus one', () => {
    expect(nextVersionName('Progetto Alfa - V2', [
      'Progetto Alfa',
      'Progetto Alfa - V2',
      'Progetto Alfa - V4',
    ])).toBe('Progetto Alfa - V5')
  })

  it('ignores projects with a different base name', () => {
    expect(nextVersionName('Progetto Alfa', ['Progetto Beta - V9'])).toBe('Progetto Alfa - V2')
  })
})
