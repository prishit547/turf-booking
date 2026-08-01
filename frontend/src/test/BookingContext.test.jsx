import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { BookingProvider, useBooking } from '../context/BookingContext'
import { api } from '../api.jsx'

vi.mock('../api.jsx', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const wrapper = ({ children }) => <BookingProvider>{children}</BookingProvider>

describe('BookingContext reservation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reserveSlot returns held status on success', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'held', hold_token: 'abc', expires_at: 123 } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.reserveSlot({ boxId: 1, date: '2030-01-15', startTime: '10:00', duration: 1 })

    expect(api.post).toHaveBeenCalledWith('/bookings/reserve/', { boxId: 1, date: '2030-01-15', startTime: '10:00', duration: 1 })
    expect(response).toEqual({ success: true, status: 'held', hold_token: 'abc', expires_at: 123 })
  })

  it('reserveSlot returns queued status with a position', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'queued', hold_token: 'def', position: 2 } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.reserveSlot({ boxId: 1, date: '2030-01-15', startTime: '10:00', duration: 1 })

    expect(response).toEqual({ success: true, status: 'queued', hold_token: 'def', position: 2 })
  })

  it('reserveSlot marks a 409 conflict as unavailable', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'This time slot is already booked.' } } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.reserveSlot({ boxId: 1, date: '2030-01-15', startTime: '10:00', duration: 1 })

    expect(response.success).toBe(false)
    expect(response.unavailable).toBe(true)
    expect(response.error).toBe('This time slot is already booked.')
  })

  it('confirmReservation adds the booking to state on success', async () => {
    const booking = { id: 42, box: { id: 1 }, date: '2030-01-15' }
    api.post.mockResolvedValueOnce({ data: booking })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.confirmReservation('abc')

    expect(api.post).toHaveBeenCalledWith('/bookings/confirm/abc/')
    expect(response).toEqual({ success: true, data: booking })
    await waitFor(() => expect(result.current.bookings).toContainEqual(booking))
  })

  it('confirmReservation surfaces a 409 error without throwing', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'Your hold has expired or is invalid. Please try again.' } } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.confirmReservation('expired-token')

    expect(response).toEqual({ success: false, error: 'Your hold has expired or is invalid. Please try again.' })
  })

  it('releaseHold posts to the right endpoint and reports success', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'promoted' } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.releaseHold('abc')

    expect(api.post).toHaveBeenCalledWith('/bookings/release_hold/abc/')
    expect(response).toEqual({ success: true, data: { status: 'promoted' } })
  })
})
