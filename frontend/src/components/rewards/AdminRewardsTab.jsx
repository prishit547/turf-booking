import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Plus, Wallet, Gift, Sparkles, Ticket, Download, UserPlus } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Input, Modal, Loader, StatTile } from '../ui';
import { useDebounce } from '../../hooks/useDebounce';

const SUB_TABS = [
  { id: 'overview', label: 'Overview', icon: Wallet },
  { id: 'cashback', label: 'Cashback', icon: Gift },
  { id: 'scratch', label: 'Scratch Cards', icon: Gift },
  { id: 'spin', label: 'Spin Wheel', icon: Sparkles },
  { id: 'redeem', label: 'Redeem Codes', icon: Ticket },
];

function SubNav({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUB_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active === t.id
              ? 'bg-primary/15 border-primary text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-elevated'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function OverviewSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/rewards/admin/overview/').then((res) => setData(res.data)).catch(() => toast.error('Failed to load rewards overview')).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader text="Loading overview..." className="py-10" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<Wallet size={20} />} tone="danger" value={`₹${data.outstanding_liability}`} label="Outstanding wallet liability" />
        <StatTile icon={<Gift size={20} />} tone="primary" value={`₹${data.cashback_paid}`} label="Cashback paid to date" />
        <StatTile icon={<Gift size={20} />} tone="secondary" value={`₹${data.scratch_card_paid}`} label="Scratch card prizes paid" />
        <StatTile icon={<Sparkles size={20} />} tone="success" value={`₹${data.spin_wheel_paid}`} label="Spin wheel prizes paid" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatTile icon={<Ticket size={20} />} tone="warning" value={`₹${data.redeem_code_value_issued}`} label="Redeem code value issued" />
        <StatTile icon={<Ticket size={20} />} tone="primary" value={`₹${data.redeem_code_value_redeemed}`} label="Redeem code value redeemed" />
      </div>
      <Card padding="md">
        <h4 className="font-display font-semibold text-foreground mb-3">Top wallet balances</h4>
        {data.top_wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.top_wallets.map((w) => (
              <div key={w.user__email} className="flex justify-between py-2 text-sm">
                <span className="text-foreground">{w.user__email}</span>
                <span className="font-medium text-foreground tabular-nums">₹{w.balance}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CashbackSection() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ percent: '', max_cashback: '', min_booking_amount: '0', active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/rewards/admin/cashback-rules/').then((res) => setRules(res.data.results || res.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/rewards/admin/cashback-rules/', {
        percent: form.percent,
        max_cashback: form.max_cashback || null,
        min_booking_amount: form.min_booking_amount || 0,
        active: form.active,
      });
      toast.success('Cashback rule saved');
      setShowModal(false);
      setForm({ percent: '', max_cashback: '', min_booking_amount: '0', active: true });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save cashback rule');
    } finally {
      setSaving(false);
    }
  };

  const activeRule = rules.find((r) => r.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-display font-semibold text-foreground">Cashback rate</h3>
        <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>New rule</Button>
      </div>
      <Card padding="md">
        {activeRule ? (
          <p className="text-foreground">
            Currently crediting <span className="font-semibold text-primary">{activeRule.percent}%</span> of every completed booking
            {activeRule.max_cashback ? ` (capped at ₹${activeRule.max_cashback})` : ''} back to the user&apos;s wallet.
          </p>
        ) : (
          <p className="text-muted-foreground">No active cashback rule — nothing is being credited automatically.</p>
        )}
      </Card>
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr>{['Percent', 'Max cap', 'Min booking', 'Status', 'Created'].map((h) => <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : rules.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No cashback rules yet</td></tr>
              ) : rules.map((r) => (
                <tr key={r.id} className="hover:bg-elevated/60">
                  <td className="py-3 px-4 text-foreground">{r.percent}%</td>
                  <td className="py-3 px-4 text-muted-foreground">{r.max_cashback ? `₹${r.max_cashback}` : 'Uncapped'}</td>
                  <td className="py-3 px-4 text-muted-foreground">₹{r.min_booking_amount}</td>
                  <td className="py-3 px-4"><Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Badge></td>
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
        title="New cashback rule"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!form.percent}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="Percent (%)" type="number" min="0" max="100" value={form.percent} onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))} placeholder="5" />
          <Input label="Max cap ₹ (optional)" type="number" min="0" value={form.max_cashback} onChange={(e) => setForm((f) => ({ ...f, max_cashback: e.target.value }))} placeholder="Uncapped" />
          <Input label="Minimum booking amount ₹" type="number" min="0" value={form.min_booking_amount} onChange={(e) => setForm((f) => ({ ...f, min_booking_amount: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Saving activates this rule and deactivates any other active rule.</p>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Master on/off switch for auto-granting a scratch card whenever a booking
 * completes — reused by both the admin (platform-wide) and owner
 * (per-owner opt-out) rewards tabs against different endpoints. Exported
 * so OwnerRewardsTab.jsx can reuse it verbatim instead of duplicating.
 */
export function AutoGrantToggle({ endpoint, title, description }) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(endpoint).then((res) => setEnabled(!!res.data.enabled)).finally(() => setLoading(false));
  }, [endpoint]);

  const handleToggle = async () => {
    setSaving(true);
    try {
      const res = await api.patch(endpoint, { enabled: !enabled });
      setEnabled(!!res.data.enabled);
      toast.success(res.data.enabled ? 'Auto-grant turned on' : 'Auto-grant turned off');
    } catch {
      toast.error('Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="md">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span>
          <span className="block text-sm font-medium text-foreground">{title}</span>
          {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
        </span>
        {loading ? (
          <span className="text-xs text-muted-foreground">Loading...</span>
        ) : (
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={handleToggle}
            className="w-5 h-5 rounded accent-primary disabled:opacity-50"
            aria-label={title}
          />
        )}
      </label>
    </Card>
  );
}

/**
 * "Grant a scratch card to a specific user" — search-as-you-type over
 * GET /user/search/ (same lightweight endpoint the booking-invite flow
 * uses), then POST {user_id} to `endpoint`. Exported so OwnerRewardsTab.jsx
 * can reuse it verbatim instead of duplicating.
 */
export function GrantScratchCardModal({ isOpen, onClose, endpoint }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [grantingId, setGrantingId] = useState(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    api.get('/user/search/', { params: { q: debouncedQuery.trim() } })
      .then((res) => setResults(res.data))
      .finally(() => setSearching(false));
  }, [debouncedQuery]);

  const handleClose = () => {
    setQuery('');
    setResults([]);
    onClose();
  };

  const handleGrant = async (user) => {
    setGrantingId(user.id);
    try {
      await api.post(endpoint, { user_id: user.id });
      toast.success(`Scratch card granted to ${user.name || user.email}`);
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to grant scratch card');
    } finally {
      setGrantingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Grant a scratch card" size="sm">
      <div className="space-y-4">
        <Input
          label="Search by name or email"
          placeholder="Type at least 2 characters..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <p className="text-sm text-muted-foreground">Searching...</p>}
        {results.length > 0 && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => handleGrant(result)}
                  disabled={grantingId === result.id}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:border-primary/50 disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{result.name || result.email}</p>
                    <p className="text-xs text-muted-foreground">{result.email}</p>
                  </div>
                  <UserPlus size={16} className="text-primary shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {debouncedQuery.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No matching users.</p>
        )}
      </div>
    </Modal>
  );
}

function ScratchCardsSection() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ label: '', prize_amount: '', weight: '1', active: true });
  const [saving, setSaving] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/rewards/admin/scratch-card-configs/').then((res) => setConfigs(res.data.results || res.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/rewards/admin/scratch-card-configs/', { label: form.label, prize_amount: form.prize_amount, weight: form.weight, active: form.active });
      toast.success('Prize tier added');
      setShowModal(false);
      setForm({ label: '', prize_amount: '', weight: '1', active: true });
      load();
    } catch {
      toast.error('Failed to add prize tier');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (config) => {
    await api.patch(`/rewards/admin/scratch-card-configs/${config.id}/`, { active: !config.active });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-xl font-display font-semibold text-foreground">Scratch card prize tiers</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGrantModal(true)} icon={<UserPlus size={16} />}>Grant to user</Button>
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>New tier</Button>
        </div>
      </div>

      <AutoGrantToggle
        endpoint="/rewards/admin/scratch-cards/auto-grant/"
        title="Auto-grant scratch cards platform-wide"
        description="Master switch — off means no scratch cards are granted for any completed booking, regardless of any owner's own setting."
      />

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr>{['Label', 'Prize', 'Weight (odds)', 'Status', ''].map((h) => <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : configs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No prize tiers yet — scratch cards won&apos;t be granted until at least one exists</td></tr>
              ) : configs.map((c) => (
                <tr key={c.id} className="hover:bg-elevated/60">
                  <td className="py-3 px-4 text-foreground">{c.label}</td>
                  <td className="py-3 px-4 text-muted-foreground">₹{c.prize_amount}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.weight}</td>
                  <td className="py-3 px-4"><Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="py-3 px-4"><Button variant="outline" size="sm" onClick={() => toggleActive(c)}>{c.active ? 'Deactivate' : 'Activate'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <GrantScratchCardModal
        isOpen={showGrantModal}
        onClose={() => setShowGrantModal(false)}
        endpoint="/rewards/admin/scratch-cards/grant/"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New scratch card prize tier"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!form.label.trim() || !form.prize_amount}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="Label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Small win" />
          <Input label="Prize amount ₹" type="number" min="0" value={form.prize_amount} onChange={(e) => setForm((f) => ({ ...f, prize_amount: e.target.value }))} placeholder="10" />
          <Input label="Weight (relative odds)" type="number" min="1" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

function SpinWheelSection() {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ label: '', prize_amount: '', weight: '1', color: '#D1FB00', order: '0' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/rewards/admin/spin-wheel-segments/').then((res) => setSegments(res.data.results || res.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/rewards/admin/spin-wheel-segments/', form);
      toast.success('Segment added');
      setShowModal(false);
      setForm({ label: '', prize_amount: '', weight: '1', color: '#D1FB00', order: '0' });
      load();
    } catch {
      toast.error('Failed to add segment');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (segment) => {
    await api.patch(`/rewards/admin/spin-wheel-segments/${segment.id}/`, { active: !segment.active });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-display font-semibold text-foreground">Spin wheel segments</h3>
        <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>New segment</Button>
      </div>
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr>{['Color', 'Label', 'Prize', 'Weight', 'Status', ''].map((h) => <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : segments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No segments yet — the spin wheel won&apos;t work until at least one exists</td></tr>
              ) : segments.map((s) => (
                <tr key={s.id} className="hover:bg-elevated/60">
                  <td className="py-3 px-4"><span className="inline-block w-4 h-4 rounded-full border border-border" style={{ backgroundColor: s.color }} /></td>
                  <td className="py-3 px-4 text-foreground">{s.label}</td>
                  <td className="py-3 px-4 text-muted-foreground">₹{s.prize_amount}</td>
                  <td className="py-3 px-4 text-muted-foreground">{s.weight}</td>
                  <td className="py-3 px-4"><Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="py-3 px-4"><Button variant="outline" size="sm" onClick={() => toggleActive(s)}>{s.active ? 'Deactivate' : 'Activate'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New spin wheel segment"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!form.label.trim() || !form.prize_amount}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="Label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="₹10 off" />
          <Input label="Prize amount ₹" type="number" min="0" value={form.prize_amount} onChange={(e) => setForm((f) => ({ ...f, prize_amount: e.target.value }))} placeholder="10" />
          <Input label="Weight (relative odds)" type="number" min="1" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
            <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="w-full h-10 rounded-lg border border-input bg-elevated" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RedeemCodesSection() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ value: '', quantity: '10', batch_label: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/rewards/admin/redeem-codes/').then((res) => setCodes(res.data.results || res.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setSaving(true);
    try {
      await api.post('/rewards/admin/redeem-codes/generate/', form);
      toast.success(`${form.quantity} codes generated`);
      setShowModal(false);
      setForm({ value: '', quantity: '10', batch_label: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to generate codes');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const rows = ['code,value,batch_label,is_used', ...codes.map((c) => `${c.code},${c.value},${c.batch_label},${c.is_used}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'redeem-codes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-xl font-display font-semibold text-foreground">Redeem codes</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} icon={<Download size={16} />} disabled={codes.length === 0}>Export CSV</Button>
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>Generate batch</Button>
        </div>
      </div>
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-elevated">
              <tr>{['Code', 'Value', 'Batch', 'Status', 'Used by'].map((h) => <th key={h} className="text-left py-3 px-4 font-medium text-foreground whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : codes.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No codes generated yet</td></tr>
              ) : codes.map((c) => (
                <tr key={c.id} className="hover:bg-elevated/60">
                  <td className="py-3 px-4 font-mono text-foreground whitespace-nowrap">{c.code}</td>
                  <td className="py-3 px-4 text-muted-foreground">₹{c.value}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.batch_label || '—'}</td>
                  <td className="py-3 px-4"><Badge tone={c.is_used ? 'neutral' : 'success'}>{c.is_used ? 'Used' : 'Available'}</Badge></td>
                  <td className="py-3 px-4 text-muted-foreground">{c.used_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Generate redeem codes"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleGenerate} loading={saving} disabled={!form.value || !form.quantity}>Generate</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input label="Value per code ₹" type="number" min="0" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="50" />
          <Input label="Quantity" type="number" min="1" max="1000" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          <Input label="Batch label (optional)" value={form.batch_label} onChange={(e) => setForm((f) => ({ ...f, batch_label: e.target.value }))} placeholder="Diwali2026" />
        </div>
      </Modal>
    </div>
  );
}

export default function AdminRewardsTab() {
  const [sub, setSub] = useState('overview');
  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-display font-semibold text-foreground">Rewards</h3>
      <SubNav active={sub} onChange={setSub} />
      {sub === 'overview' && <OverviewSection />}
      {sub === 'cashback' && <CashbackSection />}
      {sub === 'scratch' && <ScratchCardsSection />}
      {sub === 'spin' && <SpinWheelSection />}
      {sub === 'redeem' && <RedeemCodesSection />}
    </div>
  );
}
