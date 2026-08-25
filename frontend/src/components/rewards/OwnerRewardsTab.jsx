import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Plus, Gift, Ticket, UserPlus } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Input, Select, Modal, Pagination } from '../ui';
import { AutoGrantToggle, GrantScratchCardModal } from './AdminRewardsTab';

const SUB_TABS = [
  { id: 'scratch', label: 'Scratch Cards', icon: Gift },
  { id: 'promo', label: 'Promo Codes', icon: Ticket },
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

/** Own-boxes scratch-card control: opt this owner's completed bookings in
 * or out of the platform-wide auto-grant, plus a manual "gift a card to
 * this user" action — same underlying mechanic as AdminRewardsTab's
 * section, scoped to the owner's own endpoints. */
function ScratchCardsSection() {
  const [showGrantModal, setShowGrantModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-xl font-display font-semibold text-foreground">Scratch cards</h3>
        <Button variant="outline" onClick={() => setShowGrantModal(true)} icon={<UserPlus size={16} />}>Grant to user</Button>
      </div>

      <AutoGrantToggle
        endpoint="/rewards/owner/scratch-cards/auto-grant/"
        title="Auto-grant scratch cards for my boxes"
        description="Opts your boxes' completed bookings in or out of scratch-card grants. Has no effect if the platform-wide switch is off."
      />

      <Card padding="md">
        <p className="text-sm text-muted-foreground">
          Want to surprise a specific customer? Search for them and grant a scratch card on the spot —
          the prize tier is still drawn randomly from the platform&apos;s active configuration.
        </p>
      </Card>

      <GrantScratchCardModal
        isOpen={showGrantModal}
        onClose={() => setShowGrantModal(false)}
        endpoint="/rewards/owner/scratch-cards/grant/"
      />
    </div>
  );
}

/** Owner-issued, box-scoped redeem codes — checkout-time discounts for one
 * of the owner's own boxes only, not general wallet cash (see
 * rewards/models.py::RedeemCode.box and bookings/services.py::
 * apply_redeem_code). */
const PROMO_CODES_PAGE_SIZE = 20;

function PromoCodesSection({ ownerBoxes }) {
  const [selectedBoxId, setSelectedBoxId] = useState(ownerBoxes?.[0]?.id || '');
  const [codes, setCodes] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ value: '', quantity: '10', batch_label: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBoxId && ownerBoxes?.length > 0) setSelectedBoxId(ownerBoxes[0].id);
  }, [ownerBoxes, selectedBoxId]);

  // Switching facility should always land back on page 1 of its own codes.
  useEffect(() => { setPage(1); }, [selectedBoxId]);

  const load = useCallback(() => {
    if (!selectedBoxId) {
      setCodes([]);
      setCount(0);
      return;
    }
    setLoading(true);
    api.get('/rewards/owner/redeem-codes/', { params: { box_id: selectedBoxId, page, page_size: PROMO_CODES_PAGE_SIZE } })
      .then((res) => {
        setCodes(res.data.results || res.data);
        setCount(res.data.count ?? (res.data.results || res.data).length);
      })
      .finally(() => setLoading(false));
  }, [selectedBoxId, page]);
  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setSaving(true);
    try {
      await api.post('/rewards/owner/redeem-codes/generate/', { ...form, box: selectedBoxId });
      toast.success(`${form.quantity} codes generated`);
      setShowModal(false);
      setForm({ value: '', quantity: '10', batch_label: '' });
      setPage(1);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to generate codes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-xl font-display font-semibold text-foreground">Promo codes</h3>
        <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />} disabled={!selectedBoxId}>Generate codes</Button>
      </div>

      {(!ownerBoxes || ownerBoxes.length === 0) ? (
        <Card padding="lg" className="text-center">
          <p className="text-muted-foreground">Add a box first — promo codes are generated per facility.</p>
        </Card>
      ) : (
        <>
          <Card padding="md">
            <Select
              label="Facility"
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(e.target.value)}
            >
              {ownerBoxes.map((box) => (
                <option key={box.id} value={box.id}>{box.name}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              These codes only apply at checkout for this facility — customers can&apos;t redeem them into their wallet elsewhere.
            </p>
          </Card>

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
                    <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No codes generated yet for this facility</td></tr>
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
            <Pagination page={page} pageSize={PROMO_CODES_PAGE_SIZE} count={count} onPageChange={setPage} />
          </Card>
        </>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Generate promo codes"
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

export default function OwnerRewardsTab({ ownerBoxes = [] }) {
  const [sub, setSub] = useState('scratch');
  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-display font-semibold text-foreground">Rewards</h3>
      <SubNav active={sub} onChange={setSub} />
      {sub === 'scratch' && <ScratchCardsSection />}
      {sub === 'promo' && <PromoCodesSection ownerBoxes={ownerBoxes} />}
    </div>
  );
}
