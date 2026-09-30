import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  loading?: boolean;
}

export function DataTable<T>({ columns, data, rowKey, emptyMessage = 'No data', emptyAction, loading }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="glass overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skel h-10 mx-4 my-2 rounded-lg" style={{ animationDelay: `${i * 0.06}s` }} />
        ))}
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden">
      <table className="min-w-full text-sm" role="grid">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${col.className ?? ''}`}
                style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center">
                <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
                {emptyAction}
              </td>
            </tr>
          ) : (
            data.map(row => (
              <tr
                key={rowKey(row)}
                style={{ borderBottom: '1px solid var(--border)' }}
                className="transition-colors hover:bg-white/[0.02]"
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`} style={{ color: '#E8EEF6' }}>
                    {col.render ? col.render(row) : (row as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
