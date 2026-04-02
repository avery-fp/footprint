'use client'

import { forwardRef } from 'react'

interface AeInputProps {
  placeholder: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  autoFocus?: boolean
  autoComplete?: string
}

const AeInput = forwardRef<HTMLInputElement, AeInputProps>(
  ({ placeholder, value, onChange, type = 'text', autoFocus, autoComplete }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        className="w-full bg-transparent text-center focus:outline-none"
        style={{
          fontSize: '16px',
          color: 'rgba(255,255,255,0.9)',
          caretColor: 'rgba(255,255,255,0.4)',
          borderBottom: '1px solid rgba(255,255,255,0.28)',
          paddingBottom: '12px',
          transition: 'border-color 200ms ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.50)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.28)'
        }}
      />
    )
  }
)

AeInput.displayName = 'AeInput'

export default AeInput
