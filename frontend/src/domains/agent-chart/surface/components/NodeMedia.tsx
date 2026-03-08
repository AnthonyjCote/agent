import type { Actor } from '../../../../shared/config';
import type { ReactNode } from 'react';

export function NodeMediaIcon({
  kind,
  actorKind
}: {
  kind: 'business_unit' | 'org_unit' | 'shared_bucket' | 'unassigned_bucket' | 'actor';
  actorKind?: Actor['kind'];
}) {
  if (kind === 'business_unit') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.2" y="3.6" width="13.6" height="12.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.2 7.4h7.6M6.2 10h7.6M6.2 12.6h5.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'org_unit') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.6" y="4.2" width="12.8" height="11.6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.3 8h7.4M6.3 10.6h7.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'shared_bucket') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="6.2" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13.8" cy="6.2" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13.8" cy="13.8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8.2 9.2 11.7 7.2M8.2 10.8l3.5 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'unassigned_bucket') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="m7.7 7.7 4.6 4.6m0-4.6-4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (actorKind === 'human') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="7" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.2 15c.7-2.2 2.4-3.5 4.8-3.5s4.1 1.3 4.8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4.1" width="12" height="11.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8.1h6m-6 2.9h4.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function NodeMedia({
  image,
  className,
  fallback
}: {
  image: string | undefined;
  className?: string;
  fallback: ReactNode;
}) {
  return (
    <span className={`agent-chart-node-media${className ? ` ${className}` : ''}`} aria-hidden="true">
      {image ? <img src={image} alt="" /> : fallback}
    </span>
  );
}

