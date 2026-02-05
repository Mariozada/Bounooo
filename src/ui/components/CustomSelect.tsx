import { useState, useRef, useEffect, type FC, type ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
  suffix?: ReactNode
}

interface CustomSelectProps {
  id?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
}

export const CustomSelect: FC<CustomSelectProps> = ({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select...',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <div className="custom-select" ref={containerRef}>
      <button
        id={id}
        type="button"
        className="custom-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="custom-select-value">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span className="custom-select-icon">{selectedOption.icon}</span>}
              <span>{selectedOption.label}</span>
              {selectedOption.suffix && <span className="custom-select-suffix">{selectedOption.suffix}</span>}
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className={`custom-select-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="custom-select-dropdown" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              role="option"
              aria-selected={option.value === value}
            >
              {option.icon && <span className="custom-select-icon">{option.icon}</span>}
              <span className="custom-select-option-label">{option.label}</span>
              {option.suffix && <span className="custom-select-suffix">{option.suffix}</span>}
              {option.value === value && <Check size={14} className="custom-select-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
