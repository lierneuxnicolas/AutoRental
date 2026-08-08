import { useId, type InputHTMLAttributes } from 'react'
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
  type = 'text',
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? props.name ?? generatedId

  return (
    <div className="space-y-2">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-[#1F2937]">
          {label}
          {required ? <span className="ml-1 text-[#EF4444]">*</span> : null}
        </label>
      ) : null}

      <input
        id={inputId}
        type={type}
        required={required}
        disabled={disabled}
        className={cn(
          'block w-full rounded-2xl border bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-slate-500',
          error ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-red-100' : 'border-[#E5E7EB]',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? `${inputId}-help` : undefined}
        {...props}
      />

      {error ? (
        <p id={`${inputId}-help`} className="text-sm text-[#EF4444]">
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