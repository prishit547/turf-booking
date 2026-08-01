/**
 * Format a Date object as YYYY-MM-DD using the user's local timezone.
 * This avoids the UTC shift caused by Date.prototype.toISOString().
 */
export function formatLocalDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleDateString('en-CA')
}

/**
 * Combine a "YYYY-MM-DD" date string and "HH:MM" time string into a Date,
 * validating the shape first. Returns null instead of an "Invalid Date"
 * (which sorts/compares unpredictably) when either input doesn't match.
 */
export function parseBookingDateTime(dateStr, timeStr) {
  if (typeof dateStr !== 'string' || typeof timeStr !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return null

  const dateTime = new Date(`${dateStr}T${timeStr}:00`)
  return isNaN(dateTime.getTime()) ? null : dateTime
}
