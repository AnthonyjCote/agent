import type { ViewDefinition } from '@/app/shell/model/ui-contract';
import { DebugView } from './view';

export const debugViewDefinition: ViewDefinition = {
  id: 'debug',
  label: 'Debug',
  component: DebugView
};
