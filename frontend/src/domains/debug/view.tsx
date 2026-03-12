import { DebugSurface } from './surface/DebugSurface';
import './view.css';

export function DebugView() {
  return (
    <div className="debug-view">
      <DebugSurface />
    </div>
  );
}
