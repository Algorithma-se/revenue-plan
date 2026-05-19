export interface RevenueItem {
  id: string
  source_id: string
  type: 'forecast' | 'booking'
  client_name: string | null
  rep_name: string | null
  amount: number | null
  rag_status: string | null
  event_date: string | null
  synced_at: string
  notes: string | null
}

export interface RevenueAllocation {
  id: string
  revenue_item_id: string
  month: string   // 'YYYY-MM-DD' — always first of month
  amount: number
  created_at: string
}
