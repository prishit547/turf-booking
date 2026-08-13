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

    expect(api.post).toHaveBeenCalledWith('/bookings/confirm/abc/', {})
    expect(response).toEqual({ success: true, data: booking })
    await waitFor(() => expect(result.current.bookings).toContainEqual(booking))
  })

  it('confirmReservation sends a coupon code when provided', async () => {
    const booking = { id: 43, box: { id: 1 }, date: '2030-01-15' }
    api.post.mockResolvedValueOnce({ data: booking })
    const { result } = renderHook(() => useBooking(), { wrapper })

    await result.current.confirmReservation('abc', { couponCode: 'SAVE10' })

    expect(api.post).toHaveBeenCalledWith('/bookings/confirm/abc/', { couponCode: 'SAVE10' })
  })

  it('confirmReservation sends useWallet when true', async () => {
    const booking = { id: 44, box: { id: 1 }, date: '2030-01-15' }
    api.post.mockResolvedValueOnce({ data: booking })
    const { result } = renderHook(() => useBooking(), { wrapper })

    await result.current.confirmReservation('abc', { useWallet: true })

    expect(api.post).toHaveBeenCalledWith('/bookings/confirm/abc/', { useWallet: true })
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

describe('BookingContext group-invite actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inviteToBooking posts invited_user_id and invited_email', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 1, status: 'pending' } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.inviteToBooking(42, { invitedUserId: 7 })

    expect(api.post).toHaveBeenCalledWith('/bookings/42/invite/', { invited_user_id: 7, invited_email: undefined })
    expect(response).toEqual({ success: true, data: { id: 1, status: 'pending' } })
  })

  it('inviteToBooking surfaces an error without throwing', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { detail: "You can't invite yourself." } } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.inviteToBooking(42, { invitedEmail: 'me@example.com' })

    expect(response).toEqual({ success: false, error: "You can't invite yourself." })
  })

  it('respondToInvite posts to the accept endpoint', async () => {
    const booking = { id: 42 }
    api.post.mockResolvedValueOnce({ data: booking })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.respondToInvite('tok123', 'accept')

    expect(api.post).toHaveBeenCalledWith('/bookings/invites/tok123/accept/')
    expect(response).toEqual({ success: true, data: booking })
  })

  it('respondToInvite posts to the decline endpoint', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'declined' } })
    const { result } = renderHook(() => useBooking(), { wrapper })

    await result.current.respondToInvite('tok123', 'decline')

    expect(api.post).toHaveBeenCalledWith('/bookings/invites/tok123/decline/')
  })

  it('getInviteDetail fetches the public invite lookup', async () => {
    const details = { valid: true, box_name: 'Elite Sports Complex' }
    api.get.mockResolvedValueOnce({ data: details })
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.getInviteDetail('tok123')

    expect(api.get).toHaveBeenCalledWith('/bookings/invites/tok123/')
    expect(response).toEqual({ success: true, data: details })
  })

  it('searchUsers returns [] on failure instead of throwing', async () => {
    api.get.mockRejectedValueOnce(new Error('network error'))
    const { result } = renderHook(() => useBooking(), { wrapper })

    const response = await result.current.searchUsers('jan')

    expect(response).toEqual([])
  })
})
