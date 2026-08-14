import { useEffect, useRef, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { Modal, Button } from '../ui';
import ConfettiBurst from './ConfettiBurst';

/**
 * Shared celebration modal for both scratch-card and spin-wheel wins.
 * `trigger` is bumped once per open (not on every re-render) so the
 * confetti burst fires fresh each time the modal opens.
 */
export default function RewardWinModal({ isOpen, onClose, amount, title = 'You won!' }) {
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setConfettiTrigger(Date.now());
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="relative flex flex-col items-center gap-4 py-4 text-center">
        <ConfettiBurst trigger={confettiTrigger} />
        <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
          <PartyPopper size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-display font-semibold text-foreground">🎉 {title}</h2>
        <p className="text-4xl font-display font-bold text-primary tabular-nums">₹{amount}</p>
        <p className="text-sm text-muted-foreground">Added straight to your wallet.</p>
        <Button onClick={onClose} className="mt-2" fullWidth>
          Nice!
        </Button>
      </div>
    </Modal>
  );
}
