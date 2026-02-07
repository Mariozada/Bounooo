import { useState, useCallback, useRef, useEffect, type FC } from 'react'
import {
  Upload,
  Trash2,
  CheckCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Download,
  Plus,
  RefreshCw,
} from 'lucide-react'
import {
  getAllSkills,
  installSkill,
  uninstallSkill,
  setSkillEnabled,
  exportSkill,
  deleteAllSkills,
  initializeBuiltinSkills,
  invalidateSkillCache,
  type StoredSkill,
} from '@skills/index'

interface SkillsTabProps {
  onRefresh?: () => void
}

export const SkillsTab: FC<SkillsTabProps> = ({ onRefresh }) => {
  const [skills, setSkills] = useState<StoredSkill[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showInstallForm, setShowInstallForm] = useState(false)
  const [installContent, setInstallContent] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSkills = useCallback(async () => {
    setIsLoading(true)
    try {
      const allSkills = await getAllSkills()
      setSkills(allSkills)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const handleInstall = useCallback(async () => {
    if (!installContent.trim()) {
      setError('Please enter skill content')
      return
    }

    setIsInstalling(true)
    setError(null)
    setSuccess(null)

    try {
      const skill = await installSkill({ rawContent: installContent, source: 'user' })
      invalidateSkillCache()
      setSuccess(`Skill "${skill.name}" installed successfully`)
      setInstallContent('')
      setShowInstallForm(false)
      await loadSkills()
      onRefresh?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsInstalling(false)
    }
  }, [installContent, loadSkills, onRefresh])

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      setInstallContent(content)
      setShowInstallForm(true)
    } catch (err) {
      setError('Failed to read file')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleToggleEnabled = useCallback(async (skill: StoredSkill) => {
    try {
      await setSkillEnabled(skill.id, !skill.enabled)
      invalidateSkillCache()
      await loadSkills()
      onRefresh?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [loadSkills, onRefresh])

  const handleUninstall = useCallback(async (skill: StoredSkill) => {
    if (!confirm(`Uninstall skill "${skill.name}"?`)) return

    try {
      await uninstallSkill(skill.id)
      invalidateSkillCache()
      setSuccess(`Skill "${skill.name}" uninstalled`)
      await loadSkills()
      onRefresh?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [loadSkills, onRefresh])

  const handleExport = useCallback(async (skill: StoredSkill) => {
    try {
      const content = await exportSkill(skill.id)
      if (!content) return

      const blob = new Blob([content], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${skill.name}.skill.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const handleResetBuiltin = useCallback(async () => {
    if (!confirm('This will reinstall built-in skills. Continue?')) return

    try {
      // Delete existing built-in skills
      const builtinSkills = skills.filter(s => s.source === 'builtin')
      for (const skill of builtinSkills) {
        await uninstallSkill(skill.id)
      }
      // Reinstall
      await initializeBuiltinSkills()
      invalidateSkillCache()
      setSuccess('Built-in skills reset')
      await loadSkills()
      onRefresh?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [skills, loadSkills, onRefresh])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm('Delete ALL skills? This cannot be undone.')) return

    try {
      await deleteAllSkills()
      invalidateSkillCache()
      setSuccess('All skills deleted')
      await loadSkills()
      onRefresh?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [loadSkills, onRefresh])

  const getSourceBadge = (source: StoredSkill['source']) => {
    switch (source) {
      case 'builtin':
        return <span className="skill-badge builtin">Built-in</span>
      case 'registry':
        return <span className="skill-badge registry">Registry</span>
      default:
        return <span className="skill-badge user">User</span>
    }
  }

  return (
    <div className="settings-tab-content">
      {/* Status messages */}
      {error && (
        <div className="status-message error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>&times;</button>
        </div>
      )}
      {success && (
        <div className="status-message success">
          <CheckCircle size={16} />
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess(null)}>&times;</button>
        </div>
      )}

      {/* Install section */}
      <div className="settings-section">
        <h4>Install Skill</h4>

        <div className="form-group button-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.skill.md"
            onChange={handleFileImport}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="button-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            Import File
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setShowInstallForm(!showInstallForm)}
          >
            <Plus size={16} />
            Paste Content
          </button>
        </div>

        {showInstallForm && (
          <div className="install-form">
            <textarea
              value={installContent}
              onChange={(e) => setInstallContent(e.target.value)}
              placeholder={`---
name: my-skill
description: What this skill does
version: 1.0.0
---

# Instructions

Your skill instructions here...`}
              rows={10}
            />
            <div className="button-row">
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setShowInstallForm(false)
                  setInstallContent('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? 'Installing...' : 'Install Skill'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Skills list */}
      <div className="settings-section">
        <h4>Installed Skills ({skills.length})</h4>

        {isLoading ? (
          <div className="loading">Loading skills...</div>
        ) : skills.length === 0 ? (
          <div className="empty-state">
            No skills installed. Add a skill above or reset built-in skills.
          </div>
        ) : (
          <div className="skills-list">
            {skills.map((skill) => (
              <div key={skill.id} className={`skill-item ${!skill.enabled ? 'disabled' : ''}`}>
                <div className="skill-info">
                  <div className="skill-header">
                    <span className="skill-name">/{skill.name}</span>
                    {getSourceBadge(skill.source)}
                  </div>
                  <div className="skill-description">{skill.description}</div>
                  <div className="skill-meta">
                    v{skill.version}
                    {skill.author && ` by ${skill.author}`}
                  </div>
                </div>
                <div className="skill-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleToggleEnabled(skill)}
                    title={skill.enabled ? 'Disable' : 'Enable'}
                  >
                    {skill.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleExport(skill)}
                    title="Export"
                  >
                    <Download size={16} />
                  </button>
                  {skill.source !== 'builtin' && (
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => handleUninstall(skill)}
                      title="Uninstall"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Management */}
      <div className="settings-section">
        <h4>Management</h4>
        <div className="button-row">
          <button
            type="button"
            className="button-secondary"
            onClick={handleResetBuiltin}
          >
            <RefreshCw size={16} />
            Reset Built-in
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={handleDeleteAll}
          >
            <Trash2 size={16} />
            Delete All
          </button>
        </div>
      </div>
    </div>
  )
}
