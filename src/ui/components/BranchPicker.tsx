import { type FC } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface BranchPickerProps {
  currentIndex: number
  total: number
  onPrev: () => void
  onNext: () => void
  disabled?: boolean
}

export const BranchPicker: FC<BranchPickerProps> = ({
  currentIndex,
  total,
  onPrev,
  onNext,
  disabled = false,
}) => {
  // Don't show if only one version
  if (total <= 1) return null

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < total - 1

  return (
    <div className="branch-picker">
      <button
        type="button"
        className="branch-picker-btn"
        onClick={onPrev}
        disabled={disabled || !canGoPrev}
        aria-label="Previous version"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="branch-picker-count">
        {currentIndex + 1} / {total}
      </span>
      <button
        type="button"
        className="branch-picker-btn"
        onClick={onNext}
        disabled={disabled || !canGoNext}
        aria-label="Next version"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
