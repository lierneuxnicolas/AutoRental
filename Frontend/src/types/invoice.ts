export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED'

export type InvoiceLineType =
  | 'VEHICLE_RENTAL'
  | 'DELAY'
  | 'CLEANING'
  | 'DAMAGE'
  | 'FINE'
  | 'CORRECTION'

export interface InvoiceListQueryParams {
  ordering?: string
  page?: number
  search?: string
}

export interface InvoiceListItem {
  id: number
  number: string
  reservation_id: number
  status: InvoiceStatus
  issue_date: string
  total_amount: string
  currency: string
}

export interface InvoiceLine {
  id: number
  line_type: InvoiceLineType
  description: string
  quantity: string
  unit_price: string
  total_price: string
}

export interface InvoiceDetail {
  id: number
  number: string
  reservation_id: number
  client_id: number
  status: InvoiceStatus
  issue_date: string
  subtotal: string
  tax_amount: string
  total_amount: string
  currency: string
  billing_name: string
  billing_address: string
  pdf_url: string
  lines: InvoiceLine[]
  created_at: string
}

export interface PaginatedInvoiceListResponse {
  count: number
  next: string | null
  previous: string | null
  results: InvoiceListItem[]
}