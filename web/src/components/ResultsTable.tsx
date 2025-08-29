import React from 'react';
import { download, toCSV, toJSONL, toTXT } from '../lib/exporters';

type Item = { url: string; title?: string; description?: string; author?: string; published_at?: string; text?: string; };
type Props = { items: Item[] };

export default function ResultsTable({ items }: Props) {
  return (
    <div className="card">
      <h3>Results ({items.length})</h3>
      <div className="controls">
        <button onClick={() => download('results.csv', toCSV(items), 'text/csv')}>Export CSV</button>
        <button onClick={() => download('results.jsonl', toJSONL(items), 'application/json')}>Export JSONL</button>
        <button onClick={() => download('results.txt', toTXT(items), 'text/plain')}>Export TXT</button>
      </div>
      <table>
        <thead><tr><th>URL</th><th>Title</th><th>Author</th><th>Published</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><a href={it.url} target="_blank" rel="noreferrer">{it.url}</a></td>
              <td>{it.title}</td>
              <td>{it.author}</td>
              <td>{it.published_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
