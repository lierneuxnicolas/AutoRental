import api from './api'
import type {
  InvoiceDetail,
  InvoiceListQueryParams,
  PaginatedInvoiceListResponse,
} from '../types/invoice'

export async function getInvoices(params?: InvoiceListQueryParams): Promise<PaginatedInvoiceListResponse> {
  const { data } = await api.get<PaginatedInvoiceListResponse>('/invoices/', { params })
  return data
}

export async function getManagementInvoices(params?: InvoiceListQueryParams): Promise<PaginatedInvoiceListResponse> {
  const { data } = await api.get<PaginatedInvoiceListResponse>('/management/invoices/', { params })
  return data
}

export async function getInvoiceById(id: number | string): Promise<InvoiceDetail> {
  const { data } = await api.get<InvoiceDetail>(`/invoices/${id}/`)
  return data
}

export async function getInvoiceDownload(id: number | string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/invoices/${id}/download/`, {
    responseType: 'blob',
  })

  return data
}