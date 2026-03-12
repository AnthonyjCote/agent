import type { CommsChannel } from '@agent-deck/runtime-client';
import { TopRailSelectorCard, TopRailShell } from '@/shared/ui';
import './CommsTopRailSurface.css';

const CHANNELS: Array<{ id: CommsChannel; label: string }> = [
  { id: 'email', label: 'Email' },
  { id: 'chat', label: 'Chat' },
  { id: 'sms', label: 'SMS' }
];

type CommsTopRailSurfaceProps = {
  channel: CommsChannel;
  onChannelChange: (channel: CommsChannel) => void;
  activeOperator: {
    id: string;
    name: string;
    title: string;
    avatarDataUrl?: string;
  } | null;
  onOpenAccountSelector: () => void;
};

export function CommsTopRailSurface({ channel, onChannelChange, activeOperator, onOpenAccountSelector }: CommsTopRailSurfaceProps) {
  return (
    <TopRailShell
      left={<div />}
      right={
        <div className="comms-top-rail-right">
          <div className="comms-top-rail-tabs">
            {CHANNELS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`comms-top-rail-tab ${channel === item.id ? 'is-active' : ''}`}
                onClick={() => onChannelChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <TopRailSelectorCard
            operatorId={activeOperator?.id}
            name={activeOperator?.name || 'Select account'}
            subtitle={activeOperator?.title || 'No active operator'}
            avatarSrc={activeOperator?.avatarDataUrl}
            onClick={onOpenAccountSelector}
            ariaLabel="Select active comms operator"
          />
        </div>
      }
    />
  );
}
