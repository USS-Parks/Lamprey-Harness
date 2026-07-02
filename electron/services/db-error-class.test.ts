import { describe, it, expect } from 'vitest'
import { isDbUnavailableError, isFtsSyntaxError } from './db-error-class'

describe('JM-14 SQLite error classing', () => {
  it('classifies unavailability errors', () => {
    expect(isDbUnavailableError({ code: 'SQLITE_CANTOPEN', message: 'x' })).toBe(true)
    expect(isDbUnavailableError({ code: 'SQLITE_NOTADB', message: 'x' })).toBe(true)
    expect(isDbUnavailableError(new Error('The database connection is not open'))).toBe(true)
    expect(isDbUnavailableError(new Error('no such table: rag_collections'))).toBe(true)
    expect(isDbUnavailableError(new Error('electron app not available in test environment'))).toBe(true)
  })

  it('per-operation errors are NOT unavailability — they must propagate', () => {
    expect(isDbUnavailableError({ code: 'SQLITE_BUSY', message: 'database is locked' })).toBe(false)
    expect(
      isDbUnavailableError({
        code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
        message: 'UNIQUE constraint failed'
      })
    ).toBe(false)
    expect(isDbUnavailableError(new Error('fts5: syntax error near "\'"'))).toBe(false)
    expect(isDbUnavailableError(null)).toBe(false)
  })

  it('classifies FTS5 syntax errors from user-typed operators', () => {
    expect(isFtsSyntaxError(new Error('fts5: syntax error near "AND"'))).toBe(true)
    expect(isFtsSyntaxError(new Error('unterminated string'))).toBe(true)
    expect(isFtsSyntaxError(new Error('SQLITE_BUSY: database is locked'))).toBe(false)
  })
})
