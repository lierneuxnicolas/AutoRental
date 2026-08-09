import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import Card from '../../components/ui/Card'

export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const reservationId = searchParams.get('reservationId')

  return (
    <section className="py-8 sm:py-10" aria-labelledby="payment-page-title">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 id="payment-page-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          Paiement
        </h1>

        <Card className="mt-6 border-slate-200" header={<h2 className="text-lg font-semibold text-[#1F2937]">Reservation</h2>}>
          <p className="text-sm text-slate-700">
            Reservation ID: {reservationId ?? 'non fourni'}
          </p>
        </Card>

        <div className="mt-6">
          <Alert
            variant="info"
            title="Etape a venir"
            message="Le parcours Stripe n'est pas encore active. Cette page sera finalisee dans la prochaine mission."
          />
        </div>
      </div>
    </section>
  )
}
