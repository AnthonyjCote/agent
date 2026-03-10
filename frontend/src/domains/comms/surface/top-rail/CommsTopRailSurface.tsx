import type { CommsChannel } from '@agent-deck/runtime-client';
import { AgentAvatar, TopRailShell } from '../../../../shared/ui';
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
          <button type="button" className="comms-top-rail-account-card" onClick={onOpenAccountSelector}>
            <AgentAvatar
              name={activeOperator?.name || 'Select Account'}
              src={activeOperator?.avatarDataUrl}
              size="sm"
              shape="circle"
            />
            <div className="comms-top-rail-account-copy">
              <strong>{activeOperator?.name || 'Select account'}</strong>
              <span>{activeOperator?.title || 'No active operator'}</span>
            </div>
          </button>
        </div>
      }
    />
  );
}
