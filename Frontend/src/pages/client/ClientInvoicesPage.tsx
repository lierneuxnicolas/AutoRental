import { useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getInvoiceById, getInvoiceDownload, getInvoices } from '../../services/invoiceService'
import type { InvoiceStatus } from '../../types/invoice'

function formatDate(value: string): string {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatMoney(amount: string, currency: string): string {
  const parsed = Number(amount)

  if (!Number.isFinite(parsed)) {
    return `${amount} ${currency}`
  }

  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parsed)
  } catch {
    return `${parsed.toFixed(2)} ${currency}`
  }
}

function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  const payload = error.response?.data as
    | {
      detail?: string
      message?: string
    }
    | undefined

  if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
}

function statusPresentation(status: InvoiceStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case 'DRAFT':
      return { label: 'Brouillon', variant: 'neutral' }
    case 'ISSUED':
      return { label: 'Emise', variant: 'info' }
    case 'PAID':
      return { label: 'Payee', variant: 'success' }
    case 'CANCELLED':
      return { label: 'Annulee', variant: 'danger' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

function buildPdfFilename(invoiceNumber: string): string {
  return `${invoiceNumber}.pdf`
}

export default function ClientInvoicesPage() {
  const [page, setPage] = useState(1)

  const invoicesQuery = useQuery({
    queryKey: ['client-invoices', page],
    queryFn: () => getInvoices({ page, ordering: '-issue_date' }),
  })

  const downloadMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const [invoice, pdfBlob] = await Promise.all([
        getInvoiceById(invoiceId),
        getInvoiceDownload(invoiceId),
      ])

      return { invoice, pdfBlob }
    },
  })

  const pageInvoices = invoicesQuery.data?.results ?? []

  const handleDownload = async (invoiceId: number) => {
    try {
      const { invoice, pdfBlob } = await downloadMutation.mutateAsync(invoiceId)
      const objectUrl = URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildPdfFilename(invoice.number)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Error is surfaced via mutation state and rendered below.
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mon espace</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Mes factures</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Retrouvez vos factures, consultez leur detail et telechargez vos justificatifs PDF.
        </p>
      </div>

      {invoicesQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label="Chargement des factures" />
        </div>
      ) : null}

      {invoicesQuery.isError ? (
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={toErrorMessage(invoicesQuery.error)}
          className="mb-6"
        />
      ) : null}

      {downloadMutation.isError ? (
        <Alert
          variant="danger"
          title="Telechargement impossible"
          message={toErrorMessage(downloadMutation.error)}
          className="mb-6"
        />
      ) : null}

      {!invoicesQuery.isLoading && !invoicesQuery.isError && pageInvoices.length === 0 ? (
        <EmptyState
          title="Aucune facture"
          description="Vos factures apparaîtront ici après vos locations."
        />
      ) : null}

      {!invoicesQuery.isLoading && !invoicesQuery.isError && pageInvoices.length > 0 ? (
        <div className="space-y-4">
          {pageInvoices.map((invoice) => {
            const status = statusPresentation(invoice.status)
            const isDownloadingThisInvoice = downloadMutation.isPending && downloadMutation.variables === invoice.id

            return (
              <Card
                key={invoice.id}
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Facture</p>
                      <p className="text-base font-semibold text-[#0F172A]">{invoice.number}</p>
                    </div>
                    <StatusBadge variant={status.variant} label={status.label} />
                  </div>
                }
              >
                <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="font-medium text-[#1F2937]">Reference</p>
                    <p className="mt-1">{invoice.number}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Reservation</p>
                    <p className="mt-1">#{invoice.reservation_id}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Date</p>
                    <p className="mt-1">{formatDate(invoice.issue_date)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Montant</p>
                    <p className="mt-1">{formatMoney(invoice.total_amount, invoice.currency)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">Statut</p>
                    <p className="mt-1">{status.label}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to={`/client/invoices/${invoice.id}`}>
                    <Button variant="secondary" size="sm">
                      Voir le detail
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    onClick={() => {
                      void handleDownload(invoice.id)
                    }}
                    disabled={isDownloadingThisInvoice}
                  >
                    {isDownloadingThisInvoice ? (
                      <span className="flex items-center gap-2">
                        <LoadingSpinner size="sm" aria-label="Telechargement en cours" />
                        Telechargement...
                      </span>
                    ) : (
                      'Telecharger le PDF'
                    )}
                  </Button>
                </div>
              </Card>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              Total: <span className="font-semibold text-[#1F2937]">{invoicesQuery.data?.count ?? 0}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1))
                }}
                disabled={!invoicesQuery.data?.previous}
              >
                Precedent
              </Button>
              <span className="px-2 text-sm font-medium text-slate-700">Page {page}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => current + 1)
                }}
                disabled={!invoicesQuery.data?.next}
              >
                Suivant
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}