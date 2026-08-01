import { describe, it, expect } from 'vitest'
import { formatLocalDate } from '../utils/date'

describe('formatLocalDate', () => {
  it('formats a valid date as YYYY-MM-DD', () => {
    const date = new Date('2026-07-31T12:00:00')
    expect(formatLocalDate(date)).toBe('2026-07-31')
  })

  it('returns empty string for invalid input', () => {
    expect(formatLocalDate(null)).toBe('')
    expect(formatLocalDate(undefined)).toBe('')
    expect(formatLocalDate('not a date')).toBe('')
  })
})
