import { useTranslation } from 'react-i18next'
import { clientDisplay, clientLocale } from '../../i18n/clientDisplay'
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

  return parsed.toLocaleDateString(clientLocale(), {
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

  return parsed.toLocaleString(clientLocale(), {
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
    return new Intl.NumberFormat(clientLocale(), {
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
  const { t } = useTranslation()
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
        <Alert variant="danger" title={t('client.facture_invalide')} message={t('client.l_identifiant_de_facture_est_invalide')} className="mb-6" />
        <Link to="/client/invoices">
          <Button variant="secondary">{t('client.retour_a_mes_factures')}</Button>
        </Link>
      </section>
    )
  }

  if (invoiceQuery.isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label={t('client.chargement_de_la_facture')} />
      </section>
    )
  }

  if (invoiceQuery.isError || !invoiceQuery.data) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Alert
          variant="danger"
          title={t('client.chargement_impossible')}
          message={clientDisplay(t, toErrorMessage(invoiceQuery.error))}
          className="mb-6"
        />
        <div className="flex flex-wrap gap-2">
          <Link to="/client/invoices">
            <Button variant="secondary">{t('client.retour_a_mes_factures')}</Button>
          </Link>
          <Button variant="secondary" onClick={() => void invoiceQuery.refetch()}>
            {t('client.reessayer_alt')}
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">{t('client.mes_factures')}</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">{t('client.detail_de_la_facture')}</h1>
        </div>
        <Link to="/client/invoices">
          <Button variant="secondary">{t('client.retour_a_mes_factures')}</Button>
        </Link>
      </div>

      {downloadMutation.isError ? (
        <Alert
          variant="danger"
          title={t('client.telechargement_impossible_alt')}
          message={clientDisplay(t, toErrorMessage(downloadMutation.error))}
          className="mb-6"
        />
      ) : null}

      <Card
        className="mb-6"
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t('client.facture')}</p>
              <p className="text-base font-semibold text-[#0F172A]">{invoice.number}</p>
            </div>
            <StatusBadge variant={status.variant} label={clientDisplay(t, status.label)} />
          </div>
        }
      >
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.numero_facture')}</p>
            <p className="mt-1">{invoice.number}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.reservation')}</p>
            <p className="mt-1">#{invoice.reservation_id}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">Date</p>
            <p className="mt-1">{formatDate(invoice.issue_date)}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.client')}</p>
            <p className="mt-1">#{invoice.client_id}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.nom_de_facturation')}</p>
            <p className="mt-1">{invoice.billing_name}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.adresse_de_facturation')}</p>
            <p className="mt-1 whitespace-pre-line">{invoice.billing_address}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.statut')}</p>
            <p className="mt-1">{clientDisplay(t, status.label)}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.creee_le')}</p>
            <p className="mt-1">{formatDateTime(invoice.created_at)}</p>
          </div>
        </div>

        <div className="mt-5">
          <Button onClick={() => void handleDownload()} disabled={downloadMutation.isPending}>
            {downloadMutation.isPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" aria-label={t('client.telechargement_du_pdf')} />
                {t('client.telechargement_alt')}
              </span>
            ) : (
              t('client.telecharger_la_facture_pdf')
            )}
          </Button>
        </div>
      </Card>

      <Card className="mb-6" header={<h2 className="text-lg font-semibold text-[#1F2937]">{t('client.lignes_de_facture')}</h2>}>
        {invoice.lines.length === 0 ? (
          <EmptyState title={t('client.aucune_ligne')} description={t('client.aucune_ligne_de_facture_n_a_ete_retournee_par_l_api')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">{t('client.description')}</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 font-semibold">{t('client.quantite')}</th>
                  <th className="px-2 py-2 font-semibold">{t('client.prix_unitaire')}</th>
                  <th className="px-2 py-2 font-semibold">{t('public.total')}</th>
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

      <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">{t('client.montants')}</h2>}>
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-3">
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.sous_total')}</p>
            <p className="mt-1">{formatMoney(invoice.subtotal, invoice.currency)}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('client.taxes')}</p>
            <p className="mt-1">{formatMoney(invoice.tax_amount, invoice.currency)}</p>
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{t('public.total')}</p>
            <p className="mt-1 font-semibold text-[#0F172A]">{formatMoney(invoice.total_amount, invoice.currency)}</p>
          </div>
        </div>
      </Card>
    </section>
  )
}