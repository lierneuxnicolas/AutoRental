import { useTranslation } from 'react-i18next'
import { useId, useState, type FormEvent } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'

export interface InterventionCompleteFormValues {
  report: string
}

export interface InterventionCompleteFormProps {
  initialReport?: string
  onSubmit?: (values: InterventionCompleteFormValues) => void
  disabled?: boolean
  isSubmitting?: boolean
}

export default function InterventionCompleteForm({
  initialReport = '',
  onSubmit,
  disabled = false,
  isSubmitting = false,
}: InterventionCompleteFormProps) {
  const { t } = useTranslation()
  const textareaId = useId()
  const [report, setReport] = useState(initialReport)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (disabled || isSubmitting) {
      return
    }

    onSubmit?.({
      report: report.trim(),
    })
  }

  return (
    <Card
      className="border-slate-200"
      header={<p className="text-sm font-semibold text-[#2563EB]">{t("professional.cloture_de_l_intervention")}</p>}
    >
      <div className="space-y-4">
        <Alert
          variant="info"
          message={t("professional.le_formulaire_utilise_uniquement_le_champ_report_attendu_par_l_endpoint_de")}
        />

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor={textareaId} className="block text-sm font-medium text-[#1F2937]">
              {t("professional.rapport_d_intervention")}</label>
            <textarea
              id={textareaId}
              value={report}
              disabled={disabled}
              onChange={(event) => {
                setReport(event.target.value)
              }}
              rows={6}
              placeholder={t("professional.decrivez_les_operations_realisees_et_les_constats")}
              className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-slate-500"
            />
          </div>

          <Button type="submit" className="w-full sm:w-auto" disabled={disabled || isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" aria-label={t("professional.cloture_de_l_intervention")} />
                {t("client.cloture_en_cours_alt")}</span>
            ) : (
              "Terminer l'intervention"
            )}
          </Button>
        </form>
      </div>
    </Card>
  )
}
