/**
 * Hourly slot strings ("HH:00") across a box's operating hours, e.g.
 * ['06:00', '07:00', ..., '22:00'] for a box open 06:00-23:00. Mirrors the
 * loop BoxDetails.jsx uses to build the customer-facing slot picker.
 */
export function buildHourlySlots(openingTime = '06:00', closingTime = '23:00') {
  const openingHour = parseInt((openingTime || '06:00').split(':')[0], 10)
  const closingHour = parseInt((closingTime || '23:00').split(':')[0], 10)
  const slots = []
  for (let h = openingHour; h < closingHour; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`)
  }
  return slots
}

/**
 * Every "HH:00" slot a booking occupies, given its start_time ("HH:MM") and
 * duration (whole hours). Mirrors the backend's own expansion in
 * bookings/views.py's booked_slots action, so a multi-hour booking blocks
 * out each hour it actually spans rather than just its start slot.
 */
export function expandBookingSlots(startTime, duration) {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const slots = []
  for (let i = 0; i < duration; i++) {
    const hour = startHour + i
    if (hour < 24) slots.push(`${hour.toString().padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`)
  }
  return slots
}
