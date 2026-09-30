import React from 'react';

/**
 * Clinical Decision Support page — embeds the deterministic PGx review console
 * (served by the dashboard server at /cds-embed) inside the SPA. The console
 * runs evaluations, records sign-offs, and inspects the hash-chained audit log,
 * all under the dashboard's cookie session (same-origin).
 */
export default function CDS() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#E8EEF6' }}>
          Clinical Decision Support
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Deterministic pharmacogenomic dosing (CYP2D6 / CYP2C19) · CPIC-grounded ·
          every decision and sign-off recorded to an append-only, hash-chained audit log.
        </p>
      </div>

      <div
        style={{
          height: 'calc(100vh - 190px)',
          minHeight: 480,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(0,184,204,0.15)',
          background: '#ffffff',
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
        }}
      >
        <iframe
          title="CDS Review Console"
          src="/cds-embed"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    </div>
  );
}
