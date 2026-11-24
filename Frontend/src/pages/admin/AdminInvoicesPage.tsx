import { professionalDisplay } from '../../i18n/professionalDisplay'
import { clientLocale } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge, { type StatusVariant } from '../../components/ui/StatusBadge'
import { getManagementInvoices } from '../../services/invoiceService'
import type { InvoiceStatus } from '../../types/invoice'

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

export default function AdminInvoicesPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)

  const invoicesQuery = useQuery({
    queryKey: ['admin-invoices', page],
    queryFn: () => getManagementInvoices({ page, ordering: '-issue_date' }),
  })

  const pageInvoices = invoicesQuery.data?.results ?? []

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">{t("professional.administration")}</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">{t("client.factures")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {t("professional.consultez_les_factures_exposees_par_l_api_management")}</p>
      </div>

      {invoicesQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" aria-label={t("client.chargement_des_factures")} />
        </div>
      ) : null}

      {invoicesQuery.isError ? (
        <Alert
          variant="danger"
          title={t("client.chargement_impossible")}
          message={professionalDisplay(t, toErrorMessage(invoicesQuery.error))}
          className="mb-6"
        />
      ) : null}

      {!invoicesQuery.isLoading && !invoicesQuery.isError && pageInvoices.length === 0 ? (
        <EmptyState
          title={t("client.aucune_facture")}
          description={t("professional.aucune_facture_n_est_actuellement_disponible_dans_l_api_management")}
        />
      ) : null}

      {!invoicesQuery.isLoading && !invoicesQuery.isError && pageInvoices.length > 0 ? (
        <div className="space-y-4">
          {pageInvoices.map((invoice) => {
            const status = statusPresentation(invoice.status)

            return (
              <Card
                key={invoice.id}
                header={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("client.facture")}</p>
                      <p className="text-base font-semibold text-[#0F172A]">{invoice.number}</p>
                    </div>
                    <StatusBadge variant={status.variant} label={professionalDisplay(t, status.label)} />
                  </div>
                }
              >
                <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="font-medium text-[#1F2937]">{t("client.reference_alt")}</p>
                    <p className="mt-1">{invoice.number}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">{t("client.reservation")}</p>
                    <p className="mt-1">#{invoice.reservation_id}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">{t("professional.date")}</p>
                    <p className="mt-1">{formatDate(invoice.issue_date)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">{t("client.montant")}</p>
                    <p className="mt-1">{formatMoney(invoice.total_amount, invoice.currency)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">{t("client.statut")}</p>
                    <p className="mt-1">{professionalDisplay(t, status.label)}</p>
                  </div>
                </div>
              </Card>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-sm text-slate-600">
              {t("client.total")}<span className="font-semibold text-[#1F2937]">{invoicesQuery.data?.count ?? 0}</span>
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
                {t("client.precedent_alt")}</Button>
              <span className="px-2 text-sm font-medium text-slate-700">{t("client.page")} {page}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPage((current) => current + 1)
                }}
                disabled={!invoicesQuery.data?.next}
              >
                {t("client.suivant")}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
