import { useState, useEffect, useMemo } from 'react'
import { User, Phone, Plus, CheckCircle2, CalendarOff, Clock } from 'lucide-react'
import { api } from '../../api.jsx'
import { Card, Select, DateStrip, Loader } from '../ui'
import { formatLocalDate, parseBookingDateTime } from '../../utils/date'

const DURATION_OPTIONS = [1, 2, 3, 4]

// A slot only counts as "occupied" for these statuses — a Cancelled booking
// has freed its slot back up, and No-show still occupied the hour even
// though the customer never turned up.
const OCCUPIED_STATUSES = ['Confirmed', 'Completed', 'No-show']

function addHours(time, hours) {
  const [h] = time.split(':').map(Number)
  return `${((h + hours) % 24).toString().padStart(2, '0')}:00`
}

/**
 * Full-page "Box Schedule" tab — the owner-facing equivalent of the
 * customer booking flow's "Pick your slot" grid (same date strip + slot
 * grid visual language), but read-oriented: every hour shows whether it's
 * free, booked (with who), already elapsed today, or an elapsed booking
 * ("Completed"). Built for the exact walk-in scenario an owner deals with —
 * a customer shows up in person and asks what's free right now.
 */
export function OwnerScheduleTab({ boxes = [], onQuickAdd }) {
  const scheduleableBoxes = useMemo(() => boxes.filter((b) => b.status === 'approved'), [boxes])

  const [boxId, setBoxId] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [duration, setDuration] = useState(1)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!boxId && scheduleableBoxes.length) setBoxId(String(scheduleableBoxes[0].id))
  }, [scheduleableBoxes, boxId])

  // Keeps the past/upcoming split correct if this tab is left open across an
  // hour boundary, without re-rendering on every tick.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const selectedBox = scheduleableBoxes.find((b) => String(b.id) === String(boxId))
  const selectedDateStr = formatLocalDate(selectedDate)
  const isBlocked = selectedBox?.blocked_dates?.includes(selectedDateStr)

  useEffect(() => {
    if (!boxId) {
      setBookings([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      box: boxId,
      date_from: selectedDateStr,
      date_to: selectedDateStr,
      page_size: 100,
    })
    api.get(`/owner_dashboard/bookings/?${params.toString()}`)
      .then((res) => { if (!cancelled) setBookings(res.data.results || []) })
      .catch(() => { if (!cancelled) setBookings([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [boxId, selectedDateStr])

  const openingHour = parseInt((selectedBox?.opening_time || '06:00').split(':')[0], 10)
  const closingHour = parseInt((selectedBox?.closing_time || '23:00').split(':')[0], 10)

  // Every hour a booking occupies, mirroring the backend's own slot
  // expansion (bookings/views.py booked_slots) — so a multi-hour booking
  // blocks each hour it actually spans, not just its start.
  const bookingByHour = useMemo(() => {
    const map = new Map()
    bookings
      .filter((b) => b.date === selectedDateStr && OCCUPIED_STATUSES.includes(b.booking_status))
      .forEach((b) => {
        const [startHour] = b.start_time.split(':').map(Number)
        for (let i = 0; i < b.duration; i++) map.set(startHour + i, b)
      })
    return map
  }, [bookings, selectedDateStr])

  const rows = useMemo(() => {
    const out = []
    for (let h = openingHour; h + duration <= closingHour; h++) {
      const slot = `${h.toString().padStart(2, '0')}:00`
      const coveredBooking = Array.from({ length: duration }, (_, i) => bookingByHour.get(h + i)).find(Boolean) || null
      const slotDateTime = parseBookingDateTime(selectedDateStr, slot)
      const isPast = slotDateTime ? slotDateTime.getTime() < now.getTime() : false
      const state = coveredBooking ? (isPast ? 'completed' : 'booked') : (isPast ? 'past' : 'available')
      out.push({ slot, booking: coveredBooking, state })
    }
    return out
  }, [openingHour, closingHour, duration, bookingByHour, selectedDateStr, now])

  const bookedCount = rows.filter((r) => r.state === 'booked' || r.state === 'completed').length

  return (
    <div className="space-y-6">
      <Card padding="md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div>
            <h2 className="font-display text-2xl uppercase text-foreground">Box Schedule</h2>
            <p className="text-sm text-muted-foreground mt-1">
              See what&apos;s booked and what&apos;s free — handy when a walk-in customer asks in person.
            </p>
          </div>
          {scheduleableBoxes.length > 1 && (
            <Select
              value={boxId}
              onChange={(e) => setBoxId(e.target.value)}
              className="sm:w-64"
              aria-label="Box"
            >
              {scheduleableBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          )}
        </div>

        {scheduleableBoxes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            You don&apos;t have an approved box yet — this section lights up once one is live.
          </p>
        ) : (
          <>
            <div className="mt-6">
              <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} days={17} startOffset={-2} />
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-6">
              <div className="space-y-1.5">
                <label htmlFor="schedule-duration" className="block text-sm font-medium text-foreground">
                  Duration (hours)
                </label>
                <Select
                  id="schedule-duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-40"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d} hour{d > 1 ? 's' : ''}</option>
                  ))}
                </Select>
              </div>
              {!loading && !isBlocked && (
                <p className="text-sm text-muted-foreground pb-2.5">
                  {bookedCount} of {rows.length} slots booked
                  {selectedDateStr === formatLocalDate(new Date()) ? ' so far today' : ''}.
                </p>
              )}
            </div>

            <div className="mt-6">
              {loading ? (
                <div className="py-16 flex justify-center"><Loader text="Loading schedule..." /></div>
              ) : isBlocked ? (
                <div className="py-16 text-center text-muted-foreground">
                  <CalendarOff size={32} className="mx-auto mb-3 opacity-60" />
                  <p>This box is blocked off on {selectedDateStr}.</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <Clock size={32} className="mx-auto mb-3 opacity-60" />
                  <p>No {duration}-hour slot fits this box&apos;s operating hours.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(({ slot, booking, state }) => {
                    const clickable = state === 'available' && Boolean(onQuickAdd)
                    const label = `${slot} - ${addHours(slot, duration)}`
                    const customerLabel = booking && (booking.booking_source === 'owner_manual' ? (booking.customer_name || 'Walk-in') : booking.user_name)
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!clickable}
                        onClick={clickable ? () => onQuickAdd({ boxId: selectedBox.id, date: selectedDateStr, startTime: slot, duration }) : undefined}
                        className={[
                          'group relative flex flex-col items-center justify-center gap-1 rounded-xl border px-4 py-4 text-center transition-colors',
                          state === 'available' ? 'border-border bg-elevated text-foreground hover:border-primary hover:bg-primary/10 cursor-pointer' : '',
                          state === 'booked' ? 'slot-strike border-danger/30 bg-danger/10 text-danger' : '',
                          state === 'completed' ? 'border-border bg-elevated/60 text-muted-foreground' : '',
                          state === 'past' ? 'border-border/60 bg-transparent text-muted-foreground/60 cursor-not-allowed' : '',
                        ].join(' ')}
                      >
                        <span className="font-medium">{label}</span>
                        {booking ? (
                          <span className="flex items-center gap-1 text-xs opacity-90 truncate max-w-full">
                            <User size={11} className="shrink-0" /> {customerLabel}
                            {booking.customer_phone_display && (
                              <span className="flex items-center gap-0.5 shrink-0">
                                <Phone size={10} /> {booking.customer_phone_display}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                            {state === 'available' ? 'Available' : 'Past'}
                          </span>
                        )}
                        {state === 'completed' && (
                          <CheckCircle2 size={13} className="absolute right-3 top-3 text-muted-foreground" />
                        )}
                        {clickable && (
                          <Plus size={14} className="absolute right-3 top-3 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border pt-4">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-elevated border border-border rounded" /> Available</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-danger/10 border border-danger/30 rounded" /> Booked</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-elevated/60 border border-border rounded" /> Completed</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-transparent border border-border/60 rounded" /> Past</div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
