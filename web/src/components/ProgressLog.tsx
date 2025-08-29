import React from 'react';
type Props = { logs: string[] };
export default function ProgressLog({ logs }: Props) {
  return (
    <div className="card">
      <h3>Live log</h3>
      <pre className="log">{logs.join('\n')}</pre>
      <small className="dim">Tip: exports update live; you can export at any time.</small>
    </div>
  );
}
