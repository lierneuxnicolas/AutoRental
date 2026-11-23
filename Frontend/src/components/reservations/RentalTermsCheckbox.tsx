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
        J'ai lu et j'accepte les{' '}
        <Link to="/terms#conditions-location" target="_blank" rel="noopener noreferrer" className="font-medium text-[#6038FF] underline">
          Conditions générales de location
        </Link>{' '}de GetaCar.
      </span>
    </label>
  )
}
