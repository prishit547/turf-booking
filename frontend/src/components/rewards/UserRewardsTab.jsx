import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Wallet, Gift, Sparkles, Ticket, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '../../api.jsx';
import { Button, Card, Badge, Input, Loader, StatTile } from '../ui';
import RewardWinModal from './RewardWinModal';

const TXN_TONE = {
  cashback: 'success',
  scratch_card: 'primary',
  spin_wheel: 'secondary',
  redeem_code: 'success',
  booking_payment: 'danger',
  admin_adjustment: 'neutral',
  refund: 'success',
};

const TXN_LABEL = {
  cashback: 'Cashback',
  scratch_card: 'Scratch card',
  spin_wheel: 'Spin wheel',
  redeem_code: 'Redeemed code',
  booking_payment: 'Spent on booking',
  admin_adjustment: 'Adjustment',
  refund: 'Booking refund',
};

function ScratchCardTile({ card, onReveal, revealing }) {
  const isRevealed = card.is_scratched;
  return (
    <div
      className={`scratch-card-flip w-full aspect-[3/2] ${isRevealed ? 'opacity-60' : ''}`}
      onClick={() => !isRevealed && !revealing && onReveal(card)}
    >
      <div className={`scratch-card-flip-inner w-full h-full ${isRevealed ? 'is-revealed' : ''}`}>
        <div className="scratch-card-face w-full h-full absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/25 to-elevated border border-border flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors">
          <Gift size={28} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{revealing === card.id ? 'Revealing…' : 'Tap to scratch'}</span>
        </div>
        <div className="scratch-card-face scratch-card-face-back w-full h-full rounded-2xl bg-elevated border border-primary/40 flex flex-col items-center justify-center gap-1 relative">
          {isRevealed && (
            <Badge tone="neutral" className="absolute top-2 right-2">Scratched</Badge>
          )}
          <span className="text-2xl font-display text-primary tabular-nums">₹{card.prize_amount}</span>
          <span className="text-xs text-muted-foreground">Added to your wallet</span>
        </div>
      </div>
    </div>
  );
}

export default function UserRewardsTab() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [scratchCards, setScratchCards] = useState([]);
  const [spinInfo, setSpinInfo] = useState({ available: 0, segments: [] });
  const [loading, setLoading] = useState(true);
  const [revealingId, setRevealingId] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [spinRotation, setSpinRotation] = useState(0);
  const [spinResult, setSpinResult] = useState(null);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [winModal, setWinModal] = useState({ isOpen: false, amount: null, title: 'You won!' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, txnRes, cardsRes, spinRes] = await Promise.all([
        api.get('/rewards/wallet/'),
        api.get('/rewards/wallet/transactions/'),
        api.get('/rewards/scratch-cards/'),
        api.get('/rewards/spin/'),
      ]);
      setWallet(walletRes.data);
      setTransactions(txnRes.data.results || txnRes.data);
      setScratchCards(cardsRes.data.results || cardsRes.data);
      setSpinInfo(spinRes.data);
    } catch {
      toast.error('Could not load your rewards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleScratch = async (card) => {
    setRevealingId(card.id);
    try {
      const res = await api.post(`/rewards/scratch-cards/${card.id}/scratch/`);
      setScratchCards((prev) => prev.map((c) => (c.id === card.id ? res.data : c)));
      toast.success(`You won ₹${res.data.prize_amount}!`);
      setWinModal({ isOpen: true, amount: res.data.prize_amount, title: 'You won!' });
      const walletRes = await api.get('/rewards/wallet/');
      setWallet(walletRes.data);
      const txnRes = await api.get('/rewards/wallet/transactions/');
      setTransactions(txnRes.data.results || txnRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not scratch this card.');
    } finally {
      setRevealingId(null);
    }
  };

  const handleSpin = async () => {
    if (spinning || spinInfo.available < 1) return;
    setSpinning(true);
    setSpinResult(null);
    try {
      const res = await api.post('/rewards/spin/');
      const segments = spinInfo.segments;
      const idx = segments.findIndex((s) => s.id === res.data.segment_id);
      const segmentAngle = 360 / (segments.length || 1);
      // Land the pointer (fixed at top, 0deg) on the middle of the winning
      // segment — spin a few extra full turns for visual effect.
      const targetAngle = 360 * 5 - (idx * segmentAngle + segmentAngle / 2);
      setSpinRotation((prev) => prev + (targetAngle - (prev % 360)));
      setTimeout(() => {
        setSpinResult(res.data);
        toast.success(`You won ₹${res.data.prize_amount} on the spin wheel!`);
        setWinModal({ isOpen: true, amount: res.data.prize_amount, title: 'You won!' });
        loadAll();
        setSpinning(false);
      }, 4100);
    } catch (err) {
      toast.error(err.response?.data?.detail || "You don't have a spin available.");
      setSpinning(false);
    }
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!redeemInput.trim()) return;
    setRedeeming(true);
    try {
      const res = await api.post('/rewards/redeem/', { code: redeemInput.trim() });
      toast.success(`₹${res.data.value} added to your wallet!`);
      setRedeemInput('');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid code.');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return <Loader text="Loading your rewards..." className="py-10" />;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-display font-semibold text-foreground">Rewards & Wallet</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile icon={<Wallet size={22} />} tone="primary" value={`₹${wallet?.balance ?? 0}`} label="Wallet balance" />
        <StatTile icon={<ArrowUpRight size={22} />} tone="success" value={`₹${wallet?.lifetime_earned ?? 0}`} label="Lifetime earned" />
        <StatTile icon={<ArrowDownRight size={22} />} tone="danger" value={`₹${wallet?.lifetime_spent ?? 0}`} label="Lifetime spent" />
      </div>

      {/* Scratch cards */}
      <div>
        <h3 className="font-display font-semibold text-lg text-foreground mb-3 flex items-center gap-2">
          <Gift size={18} className="text-primary" /> Scratch Cards
        </h3>
        {scratchCards.filter((c) => !c.is_scratched).length === 0 && scratchCards.length === 0 ? (
          <Card padding="md"><p className="text-sm text-muted-foreground">Complete a booking to earn a scratch card.</p></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...scratchCards]
              .sort((a, b) => Number(a.is_scratched) - Number(b.is_scratched))
              .slice(0, 8)
              .map((card) => (
                <ScratchCardTile key={card.id} card={card} onReveal={handleScratch} revealing={revealingId} />
              ))}
          </div>
        )}
      </div>

      {/* Spin wheel */}
      <div>
        <h3 className="font-display font-semibold text-lg text-foreground mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" /> Spin the Wheel
        </h3>
        <Card padding="lg" className="flex flex-col items-center gap-4">
          {spinInfo.segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">The spin wheel isn&apos;t set up yet — check back soon.</p>
          ) : (
            <>
              <div className={`relative w-48 h-48 rounded-full ${!spinning ? 'wheel-glow-idle' : ''}`}>
                <div
                  className="spin-wheel-dial relative w-48 h-48 rounded-full border-4 border-elevated overflow-hidden"
                  style={{
                    transform: `rotate(${spinRotation}deg)`,
                    background: `conic-gradient(${spinInfo.segments.map((s, i) => {
                      const a1 = (360 / spinInfo.segments.length) * i;
                      const a2 = (360 / spinInfo.segments.length) * (i + 1);
                      return `${s.color} ${a1}deg ${a2}deg`;
                    }).join(', ')})`,
                  }}
                >
                  {spinInfo.segments.map((s, i) => {
                    const segmentAngle = 360 / spinInfo.segments.length;
                    const midAngle = segmentAngle * i + segmentAngle / 2;
                    return (
                      <span
                        key={s.id}
                        className="absolute top-1/2 left-1/2 text-[10px] font-semibold whitespace-nowrap"
                        style={{
                          color: '#0E1103',
                          transform: `translate(-50%, -50%) rotate(${midAngle}deg) translateY(-68px) rotate(${-midAngle}deg)`,
                        }}
                      >
                        {s.label || `₹${s.prize_amount ?? ''}`}
                      </span>
                    );
                  })}
                </div>
                {/* Decorative center hub — sits above the rotating dial layer
                    but is not itself rotated. */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card border-2 border-primary flex items-center justify-center shadow-lift">
                  <Sparkles size={16} className="text-primary" />
                </div>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-[14px] border-l-transparent border-r-transparent border-t-foreground" />
              </div>
              <Badge tone="secondary">{spinInfo.available} spin{spinInfo.available === 1 ? '' : 's'} available</Badge>
              <Button onClick={handleSpin} disabled={spinning || spinInfo.available < 1} loading={spinning}>
                {spinning ? 'Spinning…' : 'Spin now'}
              </Button>
              {spinResult && !spinning && (
                <p className="text-sm text-success font-medium">You won ₹{spinResult.prize_amount}!</p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Redeem code */}
      <div>
        <h3 className="font-display font-semibold text-lg text-foreground mb-3 flex items-center gap-2">
          <Ticket size={18} className="text-primary" /> Redeem a Code
        </h3>
        <Card padding="lg">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex flex-col items-center gap-2 sm:w-40 shrink-0 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
                <Ticket size={26} className="text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Have a voucher? Redeem it for instant wallet credit.</p>
            </div>
            <form onSubmit={handleRedeem} className="flex-1 w-full flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Enter voucher code"
                value={redeemInput}
                onChange={(e) => setRedeemInput(e.target.value.toUpperCase())}
                className="flex-1"
              />
              <Button type="submit" loading={redeeming} disabled={redeeming || !redeemInput.trim()}>Redeem</Button>
            </form>
          </div>
        </Card>
      </div>

      {/* Transaction history — the actual "where can I track my cashback"
          answer: every mechanic above writes into this same ledger. */}
      <div>
        <h3 className="font-display font-semibold text-lg text-foreground mb-3">Transaction History</h3>
        {transactions.length === 0 ? (
          <Card padding="md"><p className="text-sm text-muted-foreground">No wallet activity yet.</p></Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-border">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={TXN_TONE[txn.type] || 'neutral'}>{TXN_LABEL[txn.type] || txn.type}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(txn.created_at).toLocaleString()}</span>
                    </div>
                    {txn.description && <p className="text-xs text-muted-foreground mt-1 truncate">{txn.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-display tabular-nums ${txn.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                      {txn.amount >= 0 ? '+' : ''}₹{txn.amount}
                    </div>
                    <div className="text-xs text-muted-foreground">Bal: ₹{txn.balance_after}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <RewardWinModal
        isOpen={winModal.isOpen}
        onClose={() => setWinModal((prev) => ({ ...prev, isOpen: false }))}
        amount={winModal.amount}
        title={winModal.title}
      />
    </div>
  );
}
