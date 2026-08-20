import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, User, Phone, Plus, CheckCircle2, CalendarOff } from 'lucide-react'
import { api } from '../../api.jsx'
import { Card, Select, Badge, Loader } from '../ui'
import { formatLocalDate, parseBookingDateTime } from '../../utils/date'
import { buildHourlySlots, expandBookingSlots } from '../../utils/slots'

const DAYS = [
  { key: 'yesterday', label: 'Yesterday', offset: -1 },
  { key: 'today', label: 'Today', offset: 0 },
  { key: 'tomorrow', label: 'Tomorrow', offset: 1 },
]

// A slot only counts as "occupied" for these statuses — a Cancelled booking
// has freed its slot back up, and No-show still occupied the hour even
// though the customer never turned up.
const OCCUPIED_STATUSES = ['Confirmed', 'Completed', 'No-show']

const STATE_STYLE = {
  available: { tone: 'success', label: 'Available', dotClass: 'bg-success' },
  booked: { tone: 'danger', label: 'Booked', dotClass: 'bg-danger' },
  completed: { tone: 'neutral', label: 'Completed', dotClass: 'bg-muted-foreground' },
  past: { tone: 'neutral', label: 'Past', dotClass: 'bg-border' },
}

function endTimeLabel(startSlot) {
  const hour = parseInt(startSlot.split(':')[0], 10)
  return `${((hour + 1) % 24).toString().padStart(2, '0')}:00`
}

/**
 * Owner dashboard Overview panel — a read-only Yesterday/Today/Tomorrow
 * hour-by-hour view of one box's schedule, so an owner fielding a walk-in
 * customer can see at a glance what's free without leaving the dashboard.
 * Past hours (already elapsed relative to "now") are visually distinguished
 * from open, still-bookable slots — a booking made this morning shows as
 * "Completed" instead of an actionable "Booked" slot once its hour passes.
 */
export function OwnerScheduleCard({ boxes = [], onQuickAdd, onViewFull }) {
  const scheduleableBoxes = useMemo(() => boxes.filter((b) => b.status === 'approved'), [boxes])

  const [boxId, setBoxId] = useState('')
  const [dayKey, setDayKey] = useState('today')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!boxId && scheduleableBoxes.length) setBoxId(String(scheduleableBoxes[0].id))
  }, [scheduleableBoxes, boxId])

  // Keeps the past/upcoming split correct if this panel is left open across
  // an hour boundary, without re-rendering on every tick.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const dayDates = useMemo(() => {
    const base = new Date()
    const dates = {}
    DAYS.forEach((d) => {
      const date = new Date(base)
      date.setDate(date.getDate() + d.offset)
      dates[d.key] = date
    })
    return dates
    // Intentionally computed once at mount — this panel doesn't need to
    // survive across a midnight rollover while left open.
  }, [])

  useEffect(() => {
    if (!boxId) {
      setBookings([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      box: boxId,
      date_from: formatLocalDate(dayDates.yesterday),
      date_to: formatLocalDate(dayDates.tomorrow),
      page_size: 100,
    })
    api.get(`/owner_dashboard/bookings/?${params.toString()}`)
      .then((res) => { if (!cancelled) setBookings(res.data.results || []) })
      .catch(() => { if (!cancelled) setBookings([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [boxId, dayDates])

  const selectedBox = scheduleableBoxes.find((b) => String(b.id) === String(boxId))
  const selectedDate = dayDates[dayKey]
  const selectedDateStr = formatLocalDate(selectedDate)
  const isBlocked = selectedBox?.blocked_dates?.includes(selectedDateStr)

  const slots = useMemo(
    () => buildHourlySlots(selectedBox?.opening_time, selectedBox?.closing_time),
    [selectedBox]
  )

  const slotBookingMap = useMemo(() => {
    const map = new Map()
    bookings
      .filter((b) => b.date === selectedDateStr && OCCUPIED_STATUSES.includes(b.booking_status))
      .forEach((b) => {
        expandBookingSlots(b.start_time, b.duration).forEach((slot) => map.set(slot, b))
      })
    return map
  }, [bookings, selectedDateStr])

  const rows = useMemo(() => slots.map((slot) => {
    const booking = slotBookingMap.get(slot) || null
    const slotDateTime = parseBookingDateTime(selectedDateStr, slot)
    const isPast = slotDateTime ? slotDateTime.getTime() < now.getTime() : dayKey === 'yesterday'
    const state = booking ? (isPast ? 'completed' : 'booked') : (isPast ? 'past' : 'available')
    return { slot, booking, state }
  }), [slots, slotBookingMap, selectedDateStr, now, dayKey])

  const todayCount = rows.filter((r) => r.state === 'booked' || r.state === 'completed').length

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-primary" />
          <h3 className="text-lg font-display font-semibold text-foreground">Box Schedule</h3>
        </div>
        {onViewFull && (
          <button type="button" onClick={onViewFull} className="text-xs font-medium text-primary hover:underline shrink-0">
            View full schedule
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        See what&apos;s booked and what&apos;s free — handy when a walk-in customer asks in person.
      </p>

      {scheduleableBoxes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          You don&apos;t have an approved box yet — this panel lights up once one is live.
        </p>
      ) : (
        <>
          {scheduleableBoxes.length > 1 && (
            <Select
              value={boxId}
              onChange={(e) => setBoxId(e.target.value)}
              className="mb-3 text-sm"
              aria-label="Box"
            >
              {scheduleableBoxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          )}

          <div className="grid grid-cols-3 gap-1.5 mb-4 rounded-lg bg-elevated p-1">
            {DAYS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDayKey(d.key)}
                className={[
                  'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  dayKey === d.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {d.label}
                <span className="block text-[10px] opacity-80">
                  {dayDates[d.key].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-10 flex justify-center"><Loader text="Loading schedule..." /></div>
          ) : !selectedBox ? null : isBlocked ? (
            <div className="py-8 text-center text-muted-foreground">
              <CalendarOff size={28} className="mx-auto mb-2 opacity-60" />
              <p className="text-sm">This box is blocked off for {dayKey === 'today' ? 'today' : selectedDateStr}.</p>
            </div>
          ) : (
            <>
              {dayKey !== 'yesterday' && (
                <p className="text-xs text-muted-foreground mb-3">
                  {todayCount} of {slots.length} hours booked{dayKey === 'today' ? ' so far' : ''}.
                </p>
              )}
              <div className="space-y-1.5 max-h-[26rem] overflow-y-auto pr-1">
                {rows.map(({ slot, booking, state }) => {
                  const style = STATE_STYLE[state]
                  const clickable = state === 'available' && Boolean(onQuickAdd)
                  const Wrapper = clickable ? 'button' : 'div'
                  return (
                    <Wrapper
                      key={slot}
                      type={clickable ? 'button' : undefined}
                      onClick={clickable ? () => onQuickAdd({ boxId: selectedBox.id, date: selectedDateStr, startTime: slot }) : undefined}
                      className={[
                        'w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                        state === 'booked' ? 'border-danger/30 bg-danger/10' : '',
                        state === 'completed' ? 'border-border bg-elevated/60' : '',
                        state === 'past' ? 'border-border/60 bg-transparent opacity-60' : '',
                        state === 'available' ? 'border-success/30 bg-success/5' : '',
                        clickable ? 'hover:border-primary hover:bg-primary/10 cursor-pointer' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dotClass}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground tabular-nums flex items-center gap-1">
                            <Clock size={11} className="opacity-60" /> {slot} - {endTimeLabel(slot)}
                          </p>
                          {booking && (
                            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              <User size={10} className="opacity-70" />
                              {booking.booking_source === 'owner_manual' ? (booking.customer_name || 'Walk-in') : booking.user_name}
                              {booking.customer_phone_display && (
                                <span className="inline-flex items-center gap-0.5"><Phone size={10} className="opacity-70" />{booking.customer_phone_display}</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {state === 'completed' && <CheckCircle2 size={13} className="text-muted-foreground" />}
                        {clickable && <Plus size={13} className="text-primary" />}
                        <Badge tone={style.tone} size="sm">{style.label}</Badge>
                      </div>
                    </Wrapper>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}
