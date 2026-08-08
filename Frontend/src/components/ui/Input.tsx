import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export default function Input({
  label,
  error,
  helperText,
  id,
  required,
  disabled,
  className,
  ...props
}: InputProps) {
  const inputId = id ?? props.name

  return (
    <div className="space-y-2">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </label>
      ) : null}

      <input
        id={inputId}
        required={required}
        disabled={disabled}
        className={cn(
          'block w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
          error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : 'border-slate-300',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? `${inputId}-help` : undefined}
        {...props}
      />

      {error ? (
        <p id={`${inputId}-help`} className="text-sm text-red-600">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-help`} className="text-sm text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}