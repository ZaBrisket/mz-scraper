import { getStore } from '@netlify/blobs'
const STORE = 'brisket-scraper'

export async function appendLog(jobId: string, line: string) {
  const store = getStore(STORE)
  const key = `jobs/${jobId}.json`
  const cur = await store.get(key)
  const obj = cur ? JSON.parse(cur) : {}
  obj.logs = (obj.logs || [])
  const ts = new Date().toISOString().replace('T',' ').replace('Z','')
  obj.logs.push(`[${ts}] ${line}`)
  await store.set(key, JSON.stringify(obj))
}