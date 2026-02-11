import { useState, useCallback, type FC } from 'react'
import { X, Upload, AlertCircle } from 'lucide-react'
import type { StoredSkill } from '@skills/types'

interface PublishSkillModalProps {
  skills: StoredSkill[]
  onPublish: (skill: StoredSkill, price: number, category: string) => Promise<void>
  onClose: () => void
}

const CATEGORIES = [
  'defi',
  'trading',
  'consumer',
  'payments',
  'ai',
  'security',
  'identity',
  'infra',
  'governance',
  'general',
]

export const PublishSkillModal: FC<PublishSkillModalProps> = ({
  skills,
  onPublish,
  onClose,
}) => {
  const [selectedSkillId, setSelectedSkillId] = useState<string>('')
  const [price, setPrice] = useState<string>('0')
  const [category, setCategory] = useState<string>('general')
  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedSkill = skills.find((s) => s.id === selectedSkillId)

  const handlePublish = useCallback(async () => {
    if (!selectedSkill) {
      setError('Please select a skill to publish')
      return
    }

    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) {
      setError('Please enter a valid price (0 or greater)')
      return
    }

    setIsPublishing(true)
    setError(null)

    try {
      await onPublish(selectedSkill, priceNum, category)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish skill')
    } finally {
      setIsPublishing(false)
    }
  }, [selectedSkill, price, category, onPublish, onClose])

  // Filter out already published skills (marketplace source)
  const publishableSkills = skills.filter(
    (s) => s.source !== 'marketplace' && s.source !== 'builtin'
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Publish Skill to Marketplace</h3>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {publishableSkills.length === 0 ? (
            <div className="empty-state">
              <p>No skills available to publish.</p>
              <p className="text-muted">
                Create a custom skill first in the Skills tab.
              </p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="skill-select">Select Skill</label>
                <select
                  id="skill-select"
                  value={selectedSkillId}
                  onChange={(e) => setSelectedSkillId(e.target.value)}
                  disabled={isPublishing}
                >
                  <option value="">Choose a skill...</option>
                  {publishableSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name} (v{skill.version})
                    </option>
                  ))}
                </select>
              </div>

              {selectedSkill && (
                <div className="skill-preview">
                  <h4>{selectedSkill.name}</h4>
                  <p>{selectedSkill.description}</p>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="price-input">Price (SOL)</label>
                <input
                  id="price-input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={isPublishing}
                  placeholder="0 for free"
                />
                <span className="form-hint">Set to 0 for a free skill</span>
              </div>

              <div className="form-group">
                <label htmlFor="category-select">Category</label>
                <select
                  id="category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isPublishing}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="error-message">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={isPublishing}
          >
            Cancel
          </button>
          {publishableSkills.length > 0 && (
            <button
              type="button"
              className="button-primary"
              onClick={handlePublish}
              disabled={isPublishing || !selectedSkillId}
            >
              {isPublishing ? (
                'Publishing...'
              ) : (
                <>
                  <Upload size={14} />
                  Publish
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
