import type { ReactNode } from 'react';
import './DataListTable.css';

export type DataListTableColumn<TRow> = {
  key: string;
  header: string;
  className?: string;
  render: (row: TRow) => ReactNode;
};

type DataListTableProps<TRow> = {
  columns: DataListTableColumn<TRow>[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  rowClassName?: (row: TRow) => string | undefined;
  activeRowKey?: string | null;
  onRowClick?: (row: TRow) => void;
  emptyState?: ReactNode;
  variant?: 'windowed' | 'full-bleed';
  showHeader?: boolean;
};

export function DataListTable<TRow>({
  columns,
  rows,
  getRowKey,
  rowClassName,
  activeRowKey = null,
  onRowClick,
  emptyState = null,
  variant = 'windowed',
  showHeader = true
}: DataListTableProps<TRow>) {
  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div
      className={['data-list-table', `data-list-table-${variant}`, showHeader ? '' : 'data-list-table-header-hidden']
        .filter(Boolean)
        .join(' ')}
      role="table"
      aria-label="Data list"
    >
      <div className="data-list-table-head" role="rowgroup" aria-hidden={showHeader ? undefined : true}>
        <div className="data-list-table-row data-list-table-row-head" role="row">
          {columns.map((column) => (
            <div key={column.key} className={['data-list-table-cell', column.className].filter(Boolean).join(' ')} role="columnheader">
              {column.header}
            </div>
          ))}
        </div>
      </div>
      <div className="data-list-table-body" role="rowgroup">
        {rows.map((row) => {
          const rowKey = getRowKey(row);
          const customClassName = rowClassName?.(row);
          const classes = [
            'data-list-table-row',
            customClassName,
            activeRowKey && activeRowKey === rowKey ? 'is-active' : '',
            onRowClick ? 'is-interactive' : ''
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={rowKey}
              className={classes}
              role={onRowClick ? 'button' : 'row'}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((column) => (
                <div key={column.key} className={['data-list-table-cell', column.className].filter(Boolean).join(' ')} role="cell">
                  {column.render(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
