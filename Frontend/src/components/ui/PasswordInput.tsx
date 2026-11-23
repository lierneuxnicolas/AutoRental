import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { countPasswordCharacters, minimumPasswordLength } from '../../utils/passwordValidation'
import Input, { type InputProps } from './Input'

type PasswordInputProps = Omit<InputProps, 'type' | 'endAdornment'> & {
  minimumLengthValue?: string
}

export default function PasswordInput({
  id,
  label = 'Mot de passe',
  error,
  helperText,
  minimumLengthValue,
  ...props
}: PasswordInputProps) {
  const generatedId = useId()
  const inputId = id ?? props.name ?? generatedId
  const [visible, setVisible] = useState(false)
  const count = minimumLengthValue === undefined ? undefined : countPasswordCharacters(minimumLengthValue)
  const minimumReached = count !== undefined && count >= minimumPasswordLength
  const Icon = visible ? EyeOff : Eye
  const visibilityTarget = minimumLengthValue === undefined ? 'la confirmation du mot de passe' : 'le mot de passe'
  const describedBy = [
    error || helperText ? inputId + '-help' : undefined,
    count === undefined ? undefined : inputId + '-length',
  ].filter(Boolean).join(' ')

  return (
    <div className="space-y-2">
      <Input
        {...props}
        id={inputId}
        label={label}
        error={error}
        helperText={helperText}
        type={visible ? 'text' : 'password'}
        aria-describedby={describedBy || undefined}
        endAdornment={(
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
            aria-label={(visible ? 'Masquer ' : 'Afficher ') + visibilityTarget}
            aria-controls={inputId}
            onClick={() => setVisible((previous) => !previous)}
          >
            <Icon className="size-5" aria-hidden="true" />
          </button>
        )}
      />
      {count === undefined ? null : (
        <p
          id={inputId + '-length'}
          className={minimumReached ? 'text-sm font-medium text-emerald-700' : 'text-sm text-slate-600'}
        >
          {count} / {minimumPasswordLength} caractères minimum
        </p>
      )}
    </div>
  )
}
