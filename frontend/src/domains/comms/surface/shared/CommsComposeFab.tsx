import './CommsComposeFab.css';

type CommsComposeFabProps = {
  ariaLabel: string;
  onClick: () => void;
};

export function CommsComposeFab({ ariaLabel, onClick }: CommsComposeFabProps) {
  return (
    <button type="button" className="comms-compose-fab" aria-label={ariaLabel} onClick={onClick}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 4.2v11.6M4.2 10h11.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </button>
  );
}
