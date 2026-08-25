import { useState, useEffect } from 'react'
import { TrendingUp, Wallet, Percent, CalendarRange, Building } from 'lucide-react'
import { api } from '../../api.jsx'
import { Card, Select, Loader, StatTile, Badge } from '../ui'

const money = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Per-box earnings over a selectable window. The whole point is that an
 * owner with several venues can answer "which box made what, this month vs
 * last" — so every figure on this tab is stamped with the period it covers
 * rather than being a bare, ambiguous number.
 */
export default function OwnerEarningsTab() {
    const [period, setPeriod] = useState('this_month')
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        api.get(`/owner_dashboard/earnings/?period=${period}`)
            .then((res) => { if (!cancelled) setData(res.data) })
            .catch(() => { if (!cancelled) setData(null) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [period])

    const periods = data?.periods || [
        { value: 'this_month', label: 'This month' },
        { value: 'last_month', label: 'Last month' },
        { value: 'last_3_months', label: 'Last 3 months' },
        { value: 'last_6_months', label: 'Last 6 months' },
        { value: 'last_12_months', label: 'Last 12 months' },
        { value: 'all_time', label: 'All time' },
    ]
    const label = data?.period_label || ''
    const maxGross = Math.max(...(data?.by_box || []).map((b) => b.gross), 1)

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-display font-semibold text-foreground">Earnings by box</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        What each of your venues brought in, after platform commission.
                    </p>
                </div>
                <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-52" aria-label="Reporting period">
                    {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
            </div>

            {loading ? (
                <div className="py-16 flex justify-center"><Loader text="Loading earnings..." /></div>
            ) : !data ? (
                <Card padding="lg" className="text-center text-muted-foreground">Earnings unavailable right now.</Card>
            ) : (
                <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarRange size={16} className="text-primary" />
                        <span>
                            Showing <span className="text-foreground font-medium">{label}</span>
                            {data.date_from ? ` · ${data.date_from} to ${data.date_to}` : ' · everything to date'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                        <StatTile tone="primary" icon={<TrendingUp size={22} />} value={money(data.gross_revenue)} label={`Gross earnings · ${label}`} />
                        <StatTile tone="warning" icon={<Percent size={22} />} value={money(data.commission)} label={`Platform commission · ${label}`} />
                        <StatTile tone="success" icon={<Wallet size={22} />} value={money(data.net_revenue)} label={`Your net earnings · ${label}`} />
                        <StatTile tone="secondary" icon={<Building size={22} />} value={data.bookings_count} label={`Bookings · ${label}`} />
                    </div>

                    <Card padding="md">
                        <h3 className="text-lg font-display font-semibold text-foreground mb-1">Per-box breakdown</h3>
                        <p className="text-xs text-muted-foreground mb-4">{label} · gross, commission deducted, and what you keep.</p>
                        {data.by_box.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No earnings in this period.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-elevated">
                                        <tr>
                                            {['Box', 'Bookings', 'Gross', 'Commission', 'Net to you'].map((h, i) => (
                                                <th key={h} className={`py-3 px-4 font-medium text-foreground whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {data.by_box.map((b) => (
                                            <tr key={b.box_id}>
                                                <td className="py-3 px-4">
                                                    <p className="text-foreground font-medium">{b.box_name}</p>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        {b.sport && <Badge tone="neutral" size="sm">{b.sport}</Badge>}
                                                        <span className="text-xs text-muted-foreground">{b.rate}% commission</span>
                                                    </div>
                                                    <div className="mt-2 h-1.5 w-full max-w-40 rounded-full bg-elevated overflow-hidden">
                                                        <div className="h-full rounded-full bg-primary" style={{ width: `${(b.gross / maxGross) * 100}%` }} />
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">{b.bookings}</td>
                                                <td className="py-3 px-4 text-right text-foreground tabular-nums">{money(b.gross)}</td>
                                                <td className="py-3 px-4 text-right text-warning tabular-nums">−{money(b.commission)}</td>
                                                <td className="py-3 px-4 text-right font-medium text-success tabular-nums">{money(b.net)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-border bg-elevated/50">
                                            <td className="py-3 px-4 font-display font-semibold text-foreground">Total · {label}</td>
                                            <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">{data.bookings_count}</td>
                                            <td className="py-3 px-4 text-right font-medium text-foreground tabular-nums">{money(data.gross_revenue)}</td>
                                            <td className="py-3 px-4 text-right font-medium text-warning tabular-nums">−{money(data.commission)}</td>
                                            <td className="py-3 px-4 text-right font-bold text-success tabular-nums">{money(data.net_revenue)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </Card>

                    <Card padding="md">
                        <h3 className="text-lg font-display font-semibold text-foreground mb-1">Month by month</h3>
                        <p className="text-xs text-muted-foreground mb-4">Net earnings after commission, per calendar month.</p>
                        {data.monthly.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">Nothing to chart yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {(() => {
                                    const maxNet = Math.max(...data.monthly.map((m) => m.net), 1)
                                    return data.monthly.map((m) => (
                                        <div key={m.month} className="space-y-1.5">
                                            <div className="flex justify-between text-sm gap-3">
                                                <span className="text-foreground">{m.label}</span>
                                                <span className="text-muted-foreground tabular-nums">
                                                    {m.bookings} booking{m.bookings !== 1 ? 's' : ''} ·{' '}
                                                    <span className="text-foreground font-medium">{money(m.net)}</span> net
                                                </span>
                                            </div>
                                            <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
                                                <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${(m.net / maxNet) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))
                                })()}
                            </div>
                        )}
                    </Card>
                </>
            )}
        </div>
    )
}
