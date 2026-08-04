import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSlotReservation } from '../hooks/useSlotReservation'

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.onmessage = null
    this.closed = false
    FakeWebSocket.instances.push(this)
  }

  send() {}

  close() {
    this.closed = true
  }

  emit(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

const baseProps = {
  boxId: 5,
  date: '2030-01-15',
  startTime: '10:00',
  duration: 2,
  accessToken: 'test-token',
}

describe('useSlotReservation', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('stays idle and opens no socket when disabled', () => {
    const { result } = renderHook(() => useSlotReservation({ ...baseProps, enabled: false }))
    expect(result.current.status).toBe('idle')
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('opens a socket to the slot signature URL when enabled', () => {
    renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0].url).toContain('/ws/bookings/slot/5/2030-01-15/10:00/2/')
    expect(FakeWebSocket.instances[0].url).toContain('token=test-token')
  })

  it('seeds initial state so there is no idle flash before the resync arrives', () => {
    const { result } = renderHook(() =>
      useSlotReservation({ ...baseProps, enabled: true, initialStatus: 'held', initialExpiresAt: 12345 })
    )
    expect(result.current.status).toBe('held')
    expect(result.current.expiresAt).toBe(12345)
  })

  it('transitions to held on a held message and counts down', () => {
    const nowSeconds = Date.now() / 1000
    const { result } = renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'held', expires_at: nowSeconds + 10 })
    })

    expect(result.current.status).toBe('held')
    expect(result.current.secondsRemaining).toBeGreaterThanOrEqual(9)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(5)
  })

  it('transitions to held on a promoted message naming this user', () => {
    const nowSeconds = Date.now() / 1000
    const { result } = renderHook(() =>
      useSlotReservation({ ...baseProps, enabled: true, currentUserId: 42 })
    )

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'promoted', new_holder_user_id: '42', expires_at: nowSeconds + 10 })
    })

    expect(result.current.status).toBe('held')
  })

  it('does not steal held status when a promoted message names someone else, and decrements position instead', () => {
    // 'promoted' is broadcast to everyone watching the slot, not just the
    // person who got promoted — every other still-queued client receives
    // this same event too. Without the identity check, they'd all
    // incorrectly flip to "held".
    const { result } = renderHook(() =>
      useSlotReservation({ ...baseProps, enabled: true, currentUserId: 42 })
    )

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'queued', position: 3 })
    })
    expect(result.current.status).toBe('queued')

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'promoted', new_holder_user_id: '99', expires_at: 12345 })
    })

    expect(result.current.status).toBe('queued')
    expect(result.current.position).toBe(2)
  })

  it('transitions to queued with a position', () => {
    const { result } = renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'queued', position: 3 })
    })

    expect(result.current.status).toBe('queued')
    expect(result.current.position).toBe(3)
    expect(result.current.secondsRemaining).toBeNull()
  })

  it('transitions to lost when someone else books the slot', () => {
    const { result } = renderHook(() =>
      useSlotReservation({ ...baseProps, enabled: true, currentUserId: 42 })
    )

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'slot_booked', booked_by_user_id: '99' })
    })

    expect(result.current.status).toBe('lost')
  })

  it('does not report lost when the current user is the one who booked it', () => {
    // 'slot_booked' is broadcast to the whole group, including the
    // confirming user's own still-open socket (they've been connected since
    // placing the hold) — see bookings/views.py's confirm(). Their own
    // REST response already drives their success UI; without this check
    // they'd see a false "someone else booked this" alongside their own
    // success toast (this was the exact bug reported and fixed).
    const { result } = renderHook(() =>
      useSlotReservation({ ...baseProps, enabled: true, currentUserId: 42, initialStatus: 'held' })
    )

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'slot_booked', booked_by_user_id: '42' })
    })

    expect(result.current.status).toBe('idle')
  })

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))
    const socket = FakeWebSocket.instances[0]
    unmount()
    expect(socket.closed).toBe(true)
  })
})
