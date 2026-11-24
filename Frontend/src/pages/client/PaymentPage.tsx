import { useTranslation } from 'react-i18next'
import { clientDisplay, clientLocale, stripeLocale } from '../../i18n/clientDisplay'
import { useEffect, useMemo, useState } from 'react'
import { AxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, LoadingSpinner } from '../../components/feedback'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusBadge from '../../components/ui/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import RentalTermsCheckbox from '../../components/reservations/RentalTermsCheckbox'
import { createReservationDeposit, createReservationPaymentIntent } from '../../services/paymentService'
import { getReservationById } from '../../services/reservationService'
import type { ReservationStatus } from '../../types/reservation'

type ApiErrorPayload = {
  detail?: string
  non_field_errors?: string[]
  [key: string]: unknown
}

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

const MAX_CONFIRMATION_POLLS = 5
const CONFIRMATION_POLL_DELAY_MS = 3000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function pollReservationConfirmation(reservationId: number): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_CONFIRMATION_POLLS; attempt += 1) {
    await delay(CONFIRMATION_POLL_DELAY_MS)
    const refreshedReservation = await getReservationById(reservationId)

    if (refreshedReservation.status === 'CONFIRMEE') {
      return true
    }
  }

  return false
}

function formatDateTimeLabel(value: string): string {
  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return value
  }

  return parsedValue.toLocaleString(clientLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatCurrency(value: string | number): string {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return `${value} EUR`
  }

  return `${parsedValue.toFixed(2)} EUR`
}

function toErrorMessage(error: unknown): string {
  const fallback = 'Une erreur est survenue. Veuillez reessayer.'

  const axiosError = error as AxiosError<ApiErrorPayload>
  const payload = axiosError.response?.data

  if (!payload) {
    return fallback
  }

  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length > 0) {
    return payload.non_field_errors.join(' ')
  }

  const fieldEntries = Object.entries(payload).filter(
    ([key, value]) => key !== 'detail' && key !== 'non_field_errors' && Array.isArray(value) && value.length > 0,
  )

  if (fieldEntries.length > 0) {
    const [field, messages] = fieldEntries[0]
    const firstMessage = String((messages as unknown[])[0])
    return `${field}: ${firstMessage}`
  }

  return fallback
}

function statusLabel(status?: ReservationStatus): string {
  if (!status) {
    return 'INCONNU'
  }

  return status
}

function statusVariant(status?: ReservationStatus): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'CONFIRMEE':
      return 'success'
    case 'EN_ATTENTE_PAIEMENT':
    case 'EN_ATTENTE_CAUTION':
      return 'warning'
    case 'ANNULEE':
    case 'PAIEMENT_ECHOUE':
      return 'danger'
    case 'BROUILLON':
      return 'info'
    default:
      return 'neutral'
  }
}

interface StripePaymentFormProps {
  isSubmitting: boolean
  returnUrl: string
  onSubmit: () => Promise<void>
}

function StripePaymentForm({ isSubmitting, returnUrl, onSubmit }: StripePaymentFormProps) {
  const { t } = useTranslation()
  const stripe = useStripe()
  const elements = useElements()
  const [cardError, setCardError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!stripe || !elements) {
      return
    }

    setCardError(null)

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
      redirect: 'if_required',
    })

    if (result.error) {
      setCardError(result.error.message ?? 'Le paiement a ete refuse. Verifiez votre moyen de paiement et reessayez.')
      return
    }

    await onSubmit()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'bancontact'],
            wallets: {
              applePay: 'never',
              googlePay: 'never',
              link: 'never',
            },
          }}
        />
      </div>

      {cardError ? <Alert variant="danger" title={t('client.paiement_refuse')} message={clientDisplay(t, cardError)} /> : null}

      <Button className="w-full" variant="danger" disabled={!stripe || isSubmitting} onClick={handleSubmit}>
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" aria-label={t('client.paiement_en_cours')} />
            {t('public.paiement_en_cours')}
          </span>
        ) : (
          'Payer 97 € et préautoriser 500 €'
        )}
      </Button>
    </div>
  )
}

export default function PaymentPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()

  const reservationIdParam = searchParams.get('reservationId')
  const reservationId = reservationIdParam ? Number(reservationIdParam) : Number.NaN
  const isReservationIdValid = Number.isInteger(reservationId) && reservationId > 0
  const paymentIntentClientSecretParam = searchParams.get('payment_intent_client_secret')
  const redirectStatusParam = searchParams.get('redirect_status')

  const [acceptedRentalTermsFor, setAcceptedRentalTermsFor] = useState<number | null>(null)
  const rentalTermsAccepted = acceptedRentalTermsFor === reservationId
  const [paymentSession, setPaymentSession] = useState<{ reservationId: number; secret: string } | null>(null)
  const paymentClientSecret = paymentSession && paymentSession.reservationId === reservationId ? paymentSession.secret : null
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [isProcessingConfirmation, setIsProcessingConfirmation] = useState(false)

  const stripeReturnUrl = useMemo(() => {
    if (!isReservationIdValid) {
      return `${window.location.origin}/payment`
    }

    return `${window.location.origin}/payment?reservationId=${reservationId}`
  }, [isReservationIdValid, reservationId])

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login', {
        state: {
          from: `/payment?reservationId=${reservationIdParam ?? ''}`,
        },
      })
    }
  }, [isAuthenticated, isAuthLoading, navigate, reservationIdParam])

  const reservationQuery = useQuery({
    queryKey: ['payment-reservation', reservationId],
    queryFn: () => getReservationById(reservationId),
    enabled: isAuthenticated && isReservationIdValid,
  })

  const depositMutation = useMutation({
    mutationFn: () => createReservationDeposit(reservationId, { mode: 'STRIPE_TEST' }),
  })

  const paymentIntentMutation = useMutation({
    mutationFn: () => createReservationPaymentIntent(reservationId),
  })

  const preparePaymentMutation = useMutation({
    mutationFn: async () => {
      const depositResult = await depositMutation.mutateAsync()
      const normalizedDepositStatus = depositResult.deposit_status.toUpperCase()

      if (normalizedDepositStatus !== 'AUTHORIZED' && normalizedDepositStatus !== 'VALIDE') {
        throw new Error(depositResult.authorization_note || 'La caution Stripe a ete refusee.')
      }

      const paymentIntentResult = await paymentIntentMutation.mutateAsync()

      if (!paymentIntentResult.client_secret) {
        throw new Error('Le backend n\'a pas retourne de client_secret Stripe.')
      }

      return paymentIntentResult.client_secret
    },
    onSuccess: (clientSecret) => {
      setPaymentSession({ reservationId, secret: clientSecret })
      setWorkflowError(null)
    },
    onError: (error) => {
      setWorkflowError(toErrorMessage(error))
    },
  })

  const handleStripeSuccess = async () => {
    setIsProcessingConfirmation(true)
    setWorkflowError(null)

    try {
      const isConfirmed = await pollReservationConfirmation(reservationId)

      if (isConfirmed) {
        navigate('/client')
        return
      }

      setWorkflowError('Paiement recu, mais confirmation backend en attente. Rafraichissez dans quelques instants.')
    } catch (error) {
      setWorkflowError(toErrorMessage(error))
    } finally {
      setIsProcessingConfirmation(false)
      await reservationQuery.refetch()
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !isReservationIdValid) {
      return
    }

    if (!paymentIntentClientSecretParam && !redirectStatusParam) {
      return
    }

    let isCancelled = false

    const resumeAfterRedirect = async () => {
      setIsProcessingConfirmation(true)
      setWorkflowError(null)

      try {
        const isConfirmed = await pollReservationConfirmation(reservationId)

        if (isCancelled) {
          return
        }

        if (isConfirmed) {
          navigate('/client')
          return
        }

        if (redirectStatusParam === 'failed') {
          setWorkflowError('Le paiement Bancontact a echoue. Veuillez reessayer.')
          return
        }

        setWorkflowError('Retour Stripe recu, mais confirmation backend encore en attente. Rafraichissez dans quelques instants.')
      } catch (error) {
        if (!isCancelled) {
          setWorkflowError(toErrorMessage(error))
        }
      } finally {
        if (!isCancelled) {
          setIsProcessingConfirmation(false)
          await reservationQuery.refetch()
        }
      }
    }

    void resumeAfterRedirect()

    return () => {
      isCancelled = true
    }
  }, [
    isAuthenticated,
    isReservationIdValid,
    navigate,
    paymentIntentClientSecretParam,
    redirectStatusParam,
    reservationId,
    reservationQuery,
  ])

  const paymentSummary = useMemo(() => {
    if (!reservationQuery.data) {
      return null
    }

    const rentalAmount = Number(reservationQuery.data.rental_amount)
    const depositAmount = Number(reservationQuery.data.deposit_amount)

    return {
      rentalAmount,
      depositAmount,
    }
  }, [reservationQuery.data])

  if (!isReservationIdValid) {
    return (
      <section className="py-8 sm:py-10" aria-labelledby="payment-page-title">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 id="payment-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            {t('client.paiement')}
          </h1>
          <div className="mt-6">
            <Alert variant="danger" title={t('client.reservation_invalide')} message={t('client.le_parametre_reservationid_est_requis_et_doit_etre_un_entier_positif')} />
          </div>
        </div>
      </section>
    )
  }

  if (!stripePublishableKey || !stripePromise) {
    return (
      <section className="py-8 sm:py-10" aria-labelledby="payment-page-title">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 id="payment-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            {t('client.paiement')}
          </h1>
          <div className="mt-6">
            <Alert
              variant="danger"
              title={t('public.configuration_stripe_manquante')}
              message={t('client.la_variable_vite_stripe_publishable_key_doit_etre_definie_pour_activer')}
            />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-8 sm:py-10" aria-labelledby="payment-page-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h1 id="payment-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          {t('client.paiement')}
        </h1>

        {isAuthLoading ? (
          <div className="mt-8 flex justify-center">
            <LoadingSpinner size="lg" aria-label={t('client.verification_de_session')} />
          </div>
        ) : null}

        {!isAuthLoading && reservationQuery.isLoading ? (
          <div className="mt-8 flex justify-center">
            <LoadingSpinner size="lg" aria-label={t('client.chargement_de_la_reservation')} />
          </div>
        ) : null}

        {!isAuthLoading && reservationQuery.isError ? (
          <div className="mt-6">
            <Alert
              variant="danger"
              title={t('client.reservation_introuvable_ou_inaccessible')}
              message={clientDisplay(t, toErrorMessage(reservationQuery.error))}
            />
          </div>
        ) : null}

        {!isAuthLoading && reservationQuery.data ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">{t('client.recapitulatif_de_reservation')}</h2>}>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t('client.reference_alt')}</p>
                  <StatusBadge variant={statusVariant(reservationQuery.data.status)} label={clientDisplay(t, statusLabel(reservationQuery.data.status))} />
                </div>

                <p className="text-xl font-semibold text-[#1F2937]">{reservationQuery.data.reference}</p>

                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t('client.vehicule_alt')}</p>
                  <p className="mt-1 text-lg font-semibold text-[#1F2937]">
                    {reservationQuery.data.vehicle.brand} {reservationQuery.data.vehicle.model_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{reservationQuery.data.vehicle.category}</p>
                </div>

                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t('client.periode')}</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTimeLabel(reservationQuery.data.start_at)}</p>
                    <p className="text-sm text-slate-700">{formatDateTimeLabel(reservationQuery.data.end_at)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">{t('client.paiement_location')}</span>
                    <span className="font-semibold text-[#1F2937]">
                      {paymentSummary ? formatCurrency(paymentSummary.rentalAmount) : 'Indisponible'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">{t('public.caution')}</span>
                    <span className="font-semibold text-[#1F2937]">
                      {paymentSummary ? formatCurrency(paymentSummary.depositAmount) : 'Indisponible'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">{t('client.paiement_stripe_test')}</h2>}>
              <div className="space-y-4">
                <Alert
                  variant="info"
                  title={t('client.moyen_de_paiement')}
                  message={t('client.le_backend_calcule_les_montants_et_prepare_d_abord_la_preautorisation')}
                />

                {workflowError ? <Alert variant="danger" title={t('public.paiement_impossible')} message={clientDisplay(t, workflowError)} /> : null}

                {isProcessingConfirmation ? (
                  <Alert
                    variant="warning"
                    title={t('client.paiement_en_cours_de_confirmation')}
                    message={t('client.le_paiement_est_valide_cote_stripe_confirmation_backend_en_cours_via')}
                  />
                ) : null}

                <RentalTermsCheckbox
                  checked={rentalTermsAccepted}
                  onChange={(checked) => setAcceptedRentalTermsFor(checked ? reservationId : null)}
                />
                {!paymentClientSecret || !rentalTermsAccepted ? (
                  <Button
                    variant="danger"
                    className="w-full"
                    disabled={!rentalTermsAccepted || preparePaymentMutation.isPending || isProcessingConfirmation}
                    onClick={() => {
                      setWorkflowError(null)
                      void preparePaymentMutation.mutateAsync()
                    }}
                  >
                    {preparePaymentMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner size="sm" aria-label={t('client.preparation_du_paiement')} />
                        {t('client.preparation_du_paiement_alt')}
                      </span>
                    ) : (
                      'Preparer le paiement'
                    )}
                  </Button>
                ) : (
                  <Elements stripe={stripePromise} options={{ clientSecret: paymentClientSecret, locale: stripeLocale() }}>
                    <div className="space-y-3">
                      <StripePaymentForm
                        isSubmitting={isProcessingConfirmation}
                        returnUrl={stripeReturnUrl}
                        onSubmit={handleStripeSuccess}
                      />
                      <p className="text-sm leading-6 text-slate-600">
                        {t('professional.en_confirmant_vous_autorisez_le_paiement_de_rental_ainsi_qu_une_preautorisation', { rental: formatCurrency(paymentSummary?.rentalAmount ?? '97.00'), deposit: formatCurrency(paymentSummary?.depositAmount ?? '500.00') })}
                      </p>
                    </div>
                  </Elements>
                )}

                {!isProcessingConfirmation && paymentClientSecret && reservationQuery.data.status === 'CONFIRMEE' ? (
                  <Alert
                    variant="success"
                    title={t('client.reservation_confirmee')}
                    message={t('client.le_backend_a_confirme_votre_paiement_redirection_vers_votre_espace_client')}
                  />
                ) : null}
              </div>
            </Card>
          </div>
        ) : null}

      </div>
    </section>
  )
}
