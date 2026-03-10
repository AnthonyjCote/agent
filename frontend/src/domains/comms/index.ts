import type { ViewDefinition } from '../../app/shell/model/ui-contract';
import { CommsView } from './view';

export const commsViewDefinition: ViewDefinition = {
  id: 'comms',
  label: 'Comms',
  component: CommsView
};

