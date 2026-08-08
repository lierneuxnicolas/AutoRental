import { useId, type SelectHTMLAttributes } from 'react'
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
  placeholder?: string
}

export default function Select({
  label,
  options,
  error,
  helperText,
  placeholder,
  id,
  required,
  disabled,
  className,
  ...props
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? props.name ?? generatedId

  return (
    <div className="space-y-2">
      {label ? (
        <label htmlFor={selectId} className="block text-sm font-medium text-[#1F2937]">
          {label}
          {required ? <span className="ml-1 text-[#EF4444]">*</span> : null}
        </label>
      ) : null}

      <select
        id={selectId}
        required={required}
        disabled={disabled}
        className={cn(
          'block w-full rounded-2xl border bg-white px-4 py-3 text-[#1F2937] shadow-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-slate-500',
          error ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-red-100' : 'border-[#E5E7EB]',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? `${selectId}-help` : undefined}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? (
        <p id={`${selectId}-help`} className="text-sm text-[#EF4444]">
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