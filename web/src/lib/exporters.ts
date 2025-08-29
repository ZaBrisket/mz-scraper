export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCSV(items: any[]): string {
  const headers = ['url','title','description','author','published_at','text'];
  const escape = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const rows = [headers.join(',')];
  for (const it of items) rows.push(headers.map(h => escape((it as any)[h])).join(','));
  return rows.join('\n');
}
export function toJSONL(items: any[]): string { return items.map(x => JSON.stringify(x)).join('\n'); }
export function toTXT(items: any[]): string { return items.map(x => `# ${x.title || x.url}\n${x.text || ''}`).join('\n\n---\n\n'); }
