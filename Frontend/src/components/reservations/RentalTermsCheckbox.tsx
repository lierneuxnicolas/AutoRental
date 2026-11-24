import { Trans } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function RentalTermsCheckbox({ checked, onChange }: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 size-4 shrink-0 accent-[#6038FF]"
      />
      <span>
        <Trans
          i18nKey="public.j_ai_lu_et_j_accepte_les_terms_conditions_generales_de"
          components={{ terms: <Link to="/terms#conditions-location" target="_blank" rel="noopener noreferrer" className="font-medium text-[#6038FF] underline" /> }}
        />
      </span>
    </label>
  )
}
