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

  it('transitions to held on a held/promoted message and counts down', () => {
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

  it('transitions to queued with a position', () => {
    const { result } = renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'queued', position: 3 })
    })

    expect(result.current.status).toBe('queued')
    expect(result.current.position).toBe(3)
    expect(result.current.secondsRemaining).toBeNull()
  })

  it('transitions to lost on slot_booked', () => {
    const { result } = renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))

    act(() => {
      FakeWebSocket.instances[0].emit({ type: 'slot_booked' })
    })

    expect(result.current.status).toBe('lost')
  })

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useSlotReservation({ ...baseProps, enabled: true }))
    const socket = FakeWebSocket.instances[0]
    unmount()
    expect(socket.closed).toBe(true)
  })
})
