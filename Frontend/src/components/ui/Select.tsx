import type { SelectHTMLAttributes } from 'react'
import { cn } from './cn'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: SelectOption[]
  error?: string
  helperText?: string
}

export default function Select({
  label,
  options,
  error,
  helperText,
  id,
  required,
  disabled,
  className,
  ...props
}: SelectProps) {
  const selectId = id ?? props.name

  return (
    <div className="space-y-2">
      {label ? (
        <label htmlFor={selectId} className="block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </label>
      ) : null}

      <select
        id={selectId}
        required={required}
        disabled={disabled}
        className={cn(
          'block w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : 'border-slate-300',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? `${selectId}-help` : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? (
        <p id={`${selectId}-help`} className="text-sm text-red-600">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${selectId}-help`} className="text-sm text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}