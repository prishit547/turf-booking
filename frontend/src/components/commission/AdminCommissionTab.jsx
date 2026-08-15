import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Plus, Download } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Input, Select, Modal, Loader } from '../ui';

function PlatformDefaultRateCard() {
  const [rate, setRate] = useState('');
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/boxes/admin/commission-default/');
      setRate(String(res.data.default_rate));
      setMeta(res.data);
    } catch {
      toast.error('Failed to load platform default commission rate');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (rate === '' || Number(rate) < 0 || Number(rate) > 100) {
      toast.error('Enter a rate between 0 and 100');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch('/boxes/admin/commission-default/', { default_rate: rate });
      setRate(String(res.data.default_rate));
      setMeta(res.data);
      toast.success('Platform default commission rate updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save platform default rate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h4 className="text-base font-display font-semibold text-foreground">Platform default commission rate</h4>
      <p className="text-sm text-muted-foreground mt-1">
        Applied to any owner/sport combination that has no override below.
        {meta?.updated_at ? ` Last updated ${new Date(meta.updated_at).toLocaleDateString()}.` : ''}
      </p>
      <div className="flex items-end gap-3 mt-4">
        <div className="w-40">
          <Input
            label="Rate (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button onClick={handleSave} loading={saving} disabled={loading}>Save</Button>
      </div>
    </Card>
  );
}

function RateConfigSection() {
  const [owners, setOwners] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ owner: '', sport: '', rate: '', effective_from: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ownersRes, boxesRes, ratesRes] = await Promise.all([
        api.get('/user/users/?role=owner&page_size=200'),
        api.get('/boxes/owner/'),
        api.get('/boxes/admin/commission-rates/'),
      ]);
      setOwners(ownersRes.data.results || ownersRes.data);
      setBoxes(boxesRes.data.results || boxesRes.data);
      setRates(ratesRes.data.results || ratesRes.data);
    } catch {
      toast.error('Failed to load commission configuration');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sportsForSelectedOwner = useMemo(() => {
    if (!form.owner) return [];
    const ownerBoxes = boxes.filter((b) => String(b.owner) === String(form.owner));
    const sports = new Set();
    ownerBoxes.forEach((b) => {
      if (b.sport) sports.add(b.sport);
      (b.sports || []).forEach((s) => sports.add(s));
    });
    return Array.from(sports);
  }, [boxes, form.owner]);

  // Purely a display-layer grouping over the already-fetched `rates` array —
  // finds the latest effective_from per (owner, sport) pair so that row can
  // be badged "Current" in the table below. No new fetch, no edit-in-place;
  // the underlying create-only/versioned-row design is untouched.
  const currentRateIds = useMemo(() => {
    const latestByGroup = new Map();
    rates.forEach((r) => {
      const key = `${r.owner}::${r.sport}`;
      const existing = latestByGroup.get(key);
      if (!existing || r.effective_from > existing.effective_from) {
        latestByGroup.set(key, r);
      }
    });
    return new Set(Array.from(latestByGroup.values()).map((r) => r.id));
  }, [rates]);

  const handleCreate = async () => {
    if (form.rate === '' || Number(form.rate) < 0 || Number(form.rate) > 100) {
      toast.error('Enter a rate between 0 and 100');
      return;
    }
    setSaving(true);
    try {
      await api.post('/boxes/admin/commission-rates/', form);
      toast.success('Commission rate saved');
      setShowModal(false);
      setForm({ owner: '', sport: '', rate: '', effective_from: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save commission rate');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader text="Loading commission configuration..." className="py-10" />;

  return (
    <div className="space-y-6">
      <PlatformDefaultRateCard />

      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-display font-semibold text-foreground">Commission rate overrides</h3>
        <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>New override</Button>
      </div>
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr>{['Owner', 'Sport', 'Rate', 'Effective from', 'Created'].map((h) => <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No overrides yet — every owner uses the platform default rate</td></tr>
              ) : rates.map((r) => (
                <tr key={r.id} className="hover:bg-elevated/60">
                  <td className="py-3 px-4 text-foreground">{r.owner_email}</td>
                  <td className="py-3 px-4 text-muted-foreground">{r.sport}</td>
                  <td className="py-3 px-4 text-foreground">
                    <span className="inline-flex items-center gap-2">
                      {r.rate}%
                      {currentRateIds.has(r.id) && <Badge tone="success">Current</Badge>}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{r.effective_from}</td>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New commission rate override"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!form.owner || !form.sport || !form.rate}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Select label="Owner" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value, sport: '' }))}>
            <option value="">Select an owner…</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name || o.email}</option>)}
          </Select>
          <Select label="Sport" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))} disabled={!form.owner}>
            <option value="">Select a sport…</option>
            {sportsForSelectedOwner.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label="Rate (%)" type="number" min="0" max="100" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} placeholder="10" />
          <Input label="Effective from" type="date" value={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Saving adds a new versioned rate — past bookings before this date keep whatever rate applied at the time.</p>
        </div>
      </Modal>
    </div>
  );
}

function CommissionReportSection() {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOwner, setExpandedOwner] = useState(null);

  useEffect(() => {
    api.get('/owner_dashboard/payouts/balance/').then((res) => setBalances(res.data)).catch(() => toast.error('Failed to load commission report')).finally(() => setLoading(false));
  }, []);

  const handleExport = () => {
    const rows = ['owner_email,gross_revenue,commission,net_revenue,balance_due', ...balances.map((b) => `${b.owner_email},${b.gross_revenue},${b.commission},${b.net_revenue},${b.balance_due}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'commission-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Loader text="Loading commission report..." className="py-10" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-display font-semibold text-foreground">Commission report</h3>
        <Button variant="outline" onClick={handleExport} icon={<Download size={16} />} disabled={balances.length === 0}>Export CSV</Button>
      </div>
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr>{['Owner', 'Gross revenue', 'Commission earned', 'Net revenue', 'Balance due', ''].map((h) => <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {balances.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No owner revenue yet</td></tr>
              ) : balances.map((b) => (
                <Fragment key={b.owner_id}>
                  <tr className="hover:bg-elevated/60">
                    <td className="py-3 px-4 text-foreground">{b.owner_email}</td>
                    <td className="py-3 px-4 text-muted-foreground">₹{b.gross_revenue}</td>
                    <td className="py-3 px-4 text-foreground">₹{b.commission}</td>
                    <td className="py-3 px-4 text-muted-foreground">₹{b.net_revenue}</td>
                    <td className="py-3 px-4 font-medium">
                      {b.balance_due < 0 ? (
                        <span className="text-danger" title="A cancellation/refund after this owner was already paid out has dropped their live balance below zero.">
                          Overpaid ₹{Math.abs(b.balance_due).toLocaleString()}
                        </span>
                      ) : (
                        <span className={b.balance_due > 0 ? 'text-warning' : 'text-muted-foreground'}>₹{b.balance_due}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => setExpandedOwner(expandedOwner === b.owner_id ? null : b.owner_id)}
                      >
                        {expandedOwner === b.owner_id ? 'Hide' : 'By sport'}
                      </button>
                    </td>
                  </tr>
                  {expandedOwner === b.owner_id && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-4">
                        <div className="rounded-lg border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-elevated">
                              <tr>{['Sport', 'Rate', 'Gross', 'Commission', 'Net'].map((h) => <th key={h} className="text-left py-2 px-3 font-medium text-muted-foreground">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {(b.by_sport || []).map((row) => (
                                <tr key={row.sport}>
                                  <td className="py-2 px-3 text-foreground">{row.sport}</td>
                                  <td className="py-2 px-3 text-muted-foreground">{row.rate}%</td>
                                  <td className="py-2 px-3 text-muted-foreground">₹{row.gross}</td>
                                  <td className="py-2 px-3 text-muted-foreground">₹{row.commission}</td>
                                  <td className="py-2 px-3 text-muted-foreground">₹{row.net}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function AdminCommissionTab() {
  const [sub, setSub] = useState('config');
  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-display font-semibold text-foreground">Commission</h3>
      <div className="flex flex-wrap gap-2">
        {[{ id: 'config', label: 'Rate Configuration' }, { id: 'report', label: 'Commission Report' }].map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              sub === t.id
                ? 'bg-primary/15 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-elevated'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'config' && <RateConfigSection />}
      {sub === 'report' && <CommissionReportSection />}
    </div>
  );
}
