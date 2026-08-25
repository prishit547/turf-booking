import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api } from '../../api.jsx'

/**
 * Sliding cashback promo ticker — reads the platform's active CashbackRule
 * (admin-configured via AdminRewardsTab's Cashback tab) so the rate/cap
 * shown here always matches what actually gets credited at checkout.
 *
 * Pass `amount` (the booking/box price this ticker sits next to) to quote
 * the exact rupee figure for that price instead of the generic cap — e.g.
 * "Earn ₹150 cashback" on an ₹800 box under a 20%-capped-at-₹200 rule,
 * rather than always saying "up to ₹200" regardless of what's being booked.
 */
export function CashbackMarquee({ amount, className = '' }) {
  const [rule, setRule] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.get('/rewards/cashback/active/')
      .then((res) => { if (!cancelled && res.data.active) setRule(res.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!rule) return null

  const qualifies = amount == null || Number(amount) >= Number(rule.min_booking_amount || 0)
  const exactAmount = qualifies && amount != null
    ? Math.min(
      Number(amount) * (Number(rule.percent) / 100),
      rule.max_cashback != null ? Number(rule.max_cashback) : Infinity
    )
    : null

  const message = exactAmount != null
    ? `Earn ₹${Math.round(exactAmount).toLocaleString('en-IN')} cashback on this booking — credited to your wallet right after checkout!`
    : rule.max_cashback != null
      ? `Earn up to ₹${Number(rule.max_cashback).toLocaleString('en-IN')} cashback on your booking — credited to your wallet right after checkout!`
      : `Earn ${rule.percent}% cashback on your booking — credited to your wallet right after checkout!`

  const chunk = Array.from({ length: 4 }, () => message)

  return (
    <div className={`overflow-hidden rounded-xl border border-primary/30 bg-primary/10 py-2 ${className}`}>
      {/* The scrolling track is purely decorative repetition (8 visual
          copies so the loop has no gap) — a screen reader has no notion of
          "scrolling past", so without this the same promo would be read out
          up to 8 times in a row. One real, silent announcement replaces it. */}
      <p className="sr-only">{message}</p>
      <div className="marquee-track flex w-max" aria-hidden="true">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex shrink-0 items-center gap-10 pr-10">
            {chunk.map((m, i) => (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4 shrink-0" /> {m}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
