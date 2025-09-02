
import type { InferRequest, InferResponse, StartJobRequest, JobRecord } from './types'

async function jsonOrThrow(res: Response) {
  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* ignore */ }
  if (!res.ok || (data && data.ok === false)) {
    throw new Error(data?.error || `HTTP ${res.status}: ${text.slice(0,200)}`)
  }
  return data
}

export async function apiInfer(payload: InferRequest): Promise<InferResponse> {
  const res = await fetch('/api/schema', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  return jsonOrThrow(res)
}

export async function apiStartJob(payload: StartJobRequest): Promise<{ jobId: string, status: string }> {
  const res = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  return jsonOrThrow(res)
}

export async function apiGetJob(jobId: string): Promise<JobRecord> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
  return jsonOrThrow(res)
}

export function apiExport(jobId: string, format: 'csv'|'json'|'txt') {
  const url = `/api/export?jobId=${encodeURIComponent(jobId)}&format=${format}`
  window.open(url, '_blank')
}
