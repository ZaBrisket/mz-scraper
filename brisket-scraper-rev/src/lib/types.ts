
export type InferRequest = {
  startUrl: string
  sameOriginOnly?: boolean
}

export type InferResponse = {
  ok: boolean
  inferred?: {
    linkSelector?: string
    nextText?: string
    notes?: string[]
  }
  warnings?: string[]
  error?: string
}

export type StartJobRequest = {
  startUrl: string
  linkSelector: string
  nextText?: string
  maxPages?: number
  sameOriginOnly?: boolean
  baseDelayMs?: number
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped'

export type JobRecord = {
  id: string
  createdAt: string
  updatedAt: string
  status: JobStatus
  params: StartJobRequest
  progress: {
    page: number
    pagesCrawled: number
    itemsCollected: number
  }
  logs: string[]
  items: ScrapedItem[]
  error?: string
}

export type ScrapedItem = {
  url: string
  title?: string
  byline?: string | null
  published?: string | null
  content_text: string
  content_html?: string
}
