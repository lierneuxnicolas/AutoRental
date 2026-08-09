import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getInvoiceById, getInvoiceDownload } from '../../services/invoiceService'
import type { InvoiceDetail, InvoiceStatus } from '../../types/invoice'

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

function formatDateTime(value: string): string {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
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

function buildPdfFilename(invoice: InvoiceDetail): string {
  return `${invoice.number}.pdf`
}

export default function ClientInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const invoiceId = Number(id)
  const isValidInvoiceId = Number.isInteger(invoiceId) && invoiceId > 0

  const invoiceQuery = useQuery({
    queryKey: ['client-invoice-detail-page', invoiceId],
    queryFn: () => getInvoiceById(invoiceId),
    enabled: isValidInvoiceId,
  })

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceQuery.data) {
        throw new Error('Facture indisponible')
      }

      const pdfBlob = await getInvoiceDownload(invoiceQuery.data.id)
      return {
        invoice: invoiceQuery.data,
        pdfBlob,
      }
    },
  })

  const handleDownload = async () => {
    try {
      const { invoice, pdfBlob } = await downloadMutation.mutateAsync()
      const objectUrl = URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildPdfFilename(invoice)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Error is rendered from mutation state.
    }
  }

  if (!isValidInvoiceId) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Facture invalide" message="L'identifiant de facture est invalide." className="mb-6" />
        <Link to="/client/invoices">
          <Button variant="secondary">Retour a mes factures</Button>
        </Link>
      </section>
    )
  }

  if (invoiceQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement de la facture" />
      </section>
    )
  }

  if (invoiceQuery.isError || !invoiceQuery.data) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title="Chargement impossible"
          message={toErrorMessage(invoiceQuery.error)}
          className="mb-6"
        />
        <div className="flex flex-wrap gap-2">
          <Link to="/client/invoices">
            <Button variant="secondary">Retour a mes factures</Button>
          </Link>
          <Button variant="secondary" onClick={() => void invoiceQuery.refetch()}>
            Reessayer
          </Button>
        </div>
      </section>
    )
  }

  const invoice = invoiceQuery.data
  const status = statusPresentation(invoice.status)

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mes factures</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Detail de la facture</h1>
        </div>
        <Link to="/client/invoices">
          <Button variant="secondary">Retour a mes factures</Button>
        </Link>
      </div>

      {downloadMutation.isError ? (
        <Alert
          variant="danger"
          title="Telechargement impossible"
          message={toErrorMessage(downloadMutation.error)}
          className="mb-6"
        />
      ) : null}

      <Card
        className="mb-6"
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
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-medium text-[#1F2937]">Numero facture</p>
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
            <p className="font-medium text-[#1F2937]">Client</p>
            <p className="mt-1">#{invoice.client_id}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Nom de facturation</p>
            <p className="mt-1">{invoice.billing_name}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Adresse de facturation</p>
            <p className="mt-1 whitespace-pre-line">{invoice.billing_address}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Statut</p>
            <p className="mt-1">{status.label}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Creee le</p>
            <p className="mt-1">{formatDateTime(invoice.created_at)}</p>
          </div>
        </div>

        <div className="mt-5">
          <Button onClick={() => void handleDownload()} disabled={downloadMutation.isPending}>
            {downloadMutation.isPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" aria-label="Telechargement du PDF" />
                Telechargement...
              </span>
            ) : (
              'Telecharger la facture PDF'
            )}
          </Button>
        </div>
      </Card>

      <Card className="mb-6" header={<h2 className="text-lg font-semibold text-[#1F2937]">Lignes de facture</h2>}>
        {invoice.lines.length === 0 ? (
          <EmptyState title="Aucune ligne" description="Aucune ligne de facture n'a ete retournee par l'API." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Description</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 font-semibold">Quantite</th>
                  <th className="px-2 py-2 font-semibold">Prix unitaire</th>
                  <th className="px-2 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-[#E5E7EB] last:border-b-0">
                    <td className="px-2 py-2 text-slate-700">{line.description}</td>
                    <td className="px-2 py-2 text-slate-700">{line.line_type}</td>
                    <td className="px-2 py-2 text-slate-700">{line.quantity}</td>
                    <td className="px-2 py-2 text-slate-700">{formatMoney(line.unit_price, invoice.currency)}</td>
                    <td className="px-2 py-2 text-slate-700">{formatMoney(line.total_price, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Montants</h2>}>
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-3">
          <div>
            <p className="font-medium text-[#1F2937]">Sous-total</p>
            <p className="mt-1">{formatMoney(invoice.subtotal, invoice.currency)}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Taxes</p>
            <p className="mt-1">{formatMoney(invoice.tax_amount, invoice.currency)}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Total</p>
            <p className="mt-1 font-semibold text-[#0F172A]">{formatMoney(invoice.total_amount, invoice.currency)}</p>
          </div>
        </div>
      </Card>
    </section>
  )
}