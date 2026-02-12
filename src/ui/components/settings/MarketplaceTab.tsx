import { useState, useEffect, useCallback, type FC } from 'react'
import { Wallet, RefreshCw, Upload, Store, Package, AlertCircle, Edit3 } from 'lucide-react'
import { useWallet, shortenAddress } from '@ui/hooks/useWallet'
import {
  browseSkills,
  purchaseSkill,
  publishSkill,
  getMyPurchases,
  type MarketplaceSkill,
} from '@marketplace/manager'
import { getAllSkills, getMarketplaceSkills } from '@skills/storage'
import type { StoredSkill } from '@skills/types'
import type { PinataSettings } from '@shared/settings'
import { loadSettings, saveSettings } from '@shared/settings'
import { SkillCard } from './SkillCard'
import { PublishSkillModal } from './PublishSkillModal'

type MarketplaceView = 'browse' | 'my-skills' | 'publish'

// Validate Solana address (base58, 32-44 chars)
function isValidSolanaAddress(address: string): boolean {
  if (!address || address.length < 32 || address.length > 44) return false
  // Base58 characters (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
  return base58Regex.test(address)
}

interface MarketplaceTabProps {
  pinataSettings?: PinataSettings
  onPinataSettingsChange?: (settings: PinataSettings) => void
}

export const MarketplaceTab: FC<MarketplaceTabProps> = ({
  pinataSettings,
  onPinataSettingsChange,
}) => {
  const { wallet, isLoading: walletLoading, error: walletError, connect, disconnect, refresh, requestSignature } = useWallet('devnet')

  const [view, setView] = useState<MarketplaceView>('browse')
  const [skills, setSkills] = useState<MarketplaceSkill[]>([])
  const [mySkills, setMySkills] = useState<StoredSkill[]>([])
  const [purchasedSkills, setPurchasedSkills] = useState<MarketplaceSkill[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buyingMint, setBuyingMint] = useState<string | null>(null)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showPinataConfig, setShowPinataConfig] = useState(false)
  const [pinataKey, setPinataKey] = useState(pinataSettings?.apiKey || '')
  const [pinataSecret, setPinataSecret] = useState(pinataSettings?.secretKey || '')

  // Manual wallet entry
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  // Load marketplace skills
  const loadSkills = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const marketplaceSkills = await browseSkills('devnet', true)
      setSkills(marketplaceSkills)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load user's local skills for publishing
  const loadMySkills = useCallback(async () => {
    try {
      const storedSkills = await getAllSkills()
      setMySkills(storedSkills)
    } catch (err) {
      console.error('Failed to load local skills:', err)
    }
  }, [])

  // Load purchased skills from storage
  const loadPurchasedSkills = useCallback(async () => {
    try {
      const purchased = await getMyPurchases('devnet')
      setPurchasedSkills(purchased)
    } catch (err) {
      console.error('Failed to load purchased skills:', err)
    }
  }, [])

  useEffect(() => {
    loadSkills()
    loadMySkills()
    loadPurchasedSkills()
  }, [loadSkills, loadMySkills, loadPurchasedSkills])

  const handleConnect = async () => {
    try {
      await connect()
    } catch (err) {
      // Error is handled by the hook
    }
  }

  const handleManualConnect = async () => {
    setManualError(null)

    if (!manualAddress.trim()) {
      setManualError('Please enter a wallet address')
      return
    }

    if (!isValidSolanaAddress(manualAddress.trim())) {
      setManualError('Invalid Solana address format')
      return
    }

    try {
      // Save to settings
      const settings = await loadSettings()
      settings.wallet = {
        connected: true,
        address: manualAddress.trim(),
        network: 'devnet',
      }
      await saveSettings(settings)

      // Refresh the page to pick up new wallet state
      window.location.reload()
    } catch (err) {
      setManualError('Failed to save wallet address')
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    setShowManualEntry(false)
    setManualAddress('')
  }

  const handleBuy = async (skill: MarketplaceSkill) => {
    const isDemoSkill = skill.mint.startsWith('demo-')
    const isFreeSkill = skill.price === 0

    // Require wallet for paid non-demo skills
    if (!wallet.connected && !isDemoSkill && !isFreeSkill) {
      setError('Please connect your wallet first')
      return
    }

    setBuyingMint(skill.mint)
    setError(null)

    try {
      console.log('[Marketplace] Purchasing skill:', skill.name, skill.mint)

      // For paid skills, request signature via popup
      if (!isFreeSkill && !isDemoSkill && wallet.connected) {
        const signResult = await requestSignature({
          action: `Buy ${skill.name}`,
          amount: skill.price,
          to: skill.seller,
        })

        if (!signResult.success) {
          if (signResult.cancelled) {
            console.log('[Marketplace] Transaction cancelled by user')
            return
          }
          throw new Error(signResult.error || 'Transaction failed')
        }
      }

      const result = await purchaseSkill(skill, 'devnet')
      console.log('[Marketplace] Purchase result:', result)

      if (!result.success) {
        throw new Error(result.error || 'Purchase failed')
      }

      // Refresh both the skills list and purchased skills
      await Promise.all([loadSkills(), loadPurchasedSkills()])
    } catch (err) {
      console.error('[Marketplace] Purchase error:', err)
      setError(err instanceof Error ? err.message : 'Failed to purchase skill')
    } finally {
      setBuyingMint(null)
    }
  }

  const handlePublish = async (skill: StoredSkill, price: number, category: string) => {
    if (!wallet.connected) {
      throw new Error('Please connect your wallet first')
    }

    if (!pinataSettings?.apiKey || !pinataSettings?.secretKey) {
      throw new Error('Please configure Pinata API keys first')
    }

    const result = await publishSkill(
      skill,
      price,
      category,
      pinataSettings,
      'devnet'
    )

    if (!result.success) {
      throw new Error(result.error || 'Publish failed')
    }

    // Refresh the skills list
    await loadSkills()
  }

  const handleSavePinata = () => {
    if (onPinataSettingsChange) {
      onPinataSettingsChange({
        apiKey: pinataKey,
        secretKey: pinataSecret,
      })
    }
    setShowPinataConfig(false)
  }

  const hasPinataConfig = pinataSettings?.apiKey && pinataSettings?.secretKey

  return (
    <div className="marketplace-tab">
      {/* Wallet Section */}
      <div className="marketplace-wallet-section">
        <div className="wallet-status">
          {wallet.connected ? (
            <div className="wallet-connected">
              <div className="wallet-info">
                <Wallet size={16} />
                <span className="wallet-address">{shortenAddress(wallet.address || '', 6)}</span>
                <span className="wallet-balance">{wallet.balance.toFixed(4)} SOL</span>
                <span className="wallet-network">({wallet.network})</span>
              </div>
              <div className="wallet-actions">
                <button
                  type="button"
                  className="button-icon"
                  onClick={refresh}
                  disabled={walletLoading}
                  title="Refresh balance"
                >
                  <RefreshCw size={14} className={walletLoading ? 'spinning' : ''} />
                </button>
                <button
                  type="button"
                  className="button-secondary button-sm"
                  onClick={handleDisconnect}
                  disabled={walletLoading}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : showManualEntry ? (
            <div className="wallet-manual-entry">
              <div className="manual-input-group">
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  placeholder="Enter Solana wallet address"
                  className="manual-address-input"
                />
                <button
                  type="button"
                  className="button-primary button-sm"
                  onClick={handleManualConnect}
                >
                  Connect
                </button>
              </div>
              {manualError && (
                <div className="manual-error">
                  <AlertCircle size={12} />
                  {manualError}
                </div>
              )}
              <button
                type="button"
                className="button-link"
                onClick={() => setShowManualEntry(false)}
              >
                ← Back to Phantom
              </button>
            </div>
          ) : (
            <div className="wallet-connect-options">
              <button
                type="button"
                className="button-primary"
                onClick={handleConnect}
                disabled={walletLoading}
              >
                <Wallet size={16} />
                {walletLoading ? 'Connecting...' : 'Connect Phantom'}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowManualEntry(true)}
              >
                <Edit3 size={16} />
                Enter Manually
              </button>
            </div>
          )}
        </div>

        {walletError && (
          <div className="wallet-error">
            <AlertCircle size={14} />
            {walletError}
          </div>
        )}
      </div>

      {/* View Tabs */}
      <div className="marketplace-view-tabs">
        <button
          type="button"
          className={`view-tab ${view === 'browse' ? 'active' : ''}`}
          onClick={() => setView('browse')}
        >
          <Store size={14} />
          Browse
        </button>
        <button
          type="button"
          className={`view-tab ${view === 'my-skills' ? 'active' : ''}`}
          onClick={() => setView('my-skills')}
        >
          <Package size={14} />
          My Skills
        </button>
        <button
          type="button"
          className={`view-tab ${view === 'publish' ? 'active' : ''}`}
          onClick={() => setView('publish')}
        >
          <Upload size={14} />
          Publish
        </button>
      </div>

      {/* Content */}
      <div className="marketplace-content">
        {error && (
          <div className="error-message">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {view === 'browse' && (
          <div className="skills-grid">
            {isLoading ? (
              <div className="loading-state">Loading skills...</div>
            ) : skills.length === 0 ? (
              <div className="empty-state">
                <Store size={32} />
                <p>No skills available yet</p>
                <p className="text-muted">Be the first to publish a skill!</p>
              </div>
            ) : (
              skills.map((skill) => (
                <SkillCard
                  key={skill.mint}
                  skill={skill}
                  onBuy={handleBuy}
                  isLoading={buyingMint === skill.mint}
                  disabled={false}
                />
              ))
            )}
          </div>
        )}

        {view === 'my-skills' && (
          <div className="my-skills-section">
            <h4>Purchased Skills</h4>
            <div className="skills-grid">
              {purchasedSkills.length === 0 ? (
                <div className="empty-state">
                  <Package size={32} />
                  <p>No purchased skills yet</p>
                  <p className="text-muted">Skills you buy from the marketplace will appear here</p>
                </div>
              ) : (
                purchasedSkills.map((skill, index) => (
                  <SkillCard
                    key={skill.mint ? `mint-${skill.mint}` : `skill-${skill.name}-${index}`}
                    skill={skill}
                    onBuy={handleBuy}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {view === 'publish' && (
          <div className="publish-section">
            <div className="publish-info">
              <h4>Publish Your Skills</h4>
              <p>
                Share your skills with the community and earn SOL when others purchase them.
              </p>
            </div>

            {/* Pinata Configuration */}
            <div className="pinata-config">
              <div className="config-header">
                <span>IPFS Storage (Pinata)</span>
                {hasPinataConfig ? (
                  <span className="config-status success">Configured</span>
                ) : (
                  <span className="config-status warning">Not configured</span>
                )}
              </div>

              {showPinataConfig ? (
                <div className="config-form">
                  <div className="form-group">
                    <label htmlFor="pinata-key">API Key</label>
                    <input
                      id="pinata-key"
                      type="text"
                      value={pinataKey}
                      onChange={(e) => setPinataKey(e.target.value)}
                      placeholder="Enter Pinata API Key"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="pinata-secret">Secret Key</label>
                    <input
                      id="pinata-secret"
                      type="password"
                      value={pinataSecret}
                      onChange={(e) => setPinataSecret(e.target.value)}
                      placeholder="Enter Pinata Secret Key"
                    />
                  </div>
                  <div className="config-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setShowPinataConfig(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={handleSavePinata}
                    >
                      Save
                    </button>
                  </div>
                  <p className="form-hint">
                    Get free API keys at{' '}
                    <a href="https://pinata.cloud" target="_blank" rel="noopener noreferrer">
                      pinata.cloud
                    </a>
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setShowPinataConfig(true)}
                >
                  {hasPinataConfig ? 'Update Keys' : 'Configure Pinata'}
                </button>
              )}
            </div>

            <button
              type="button"
              className="button-primary publish-button"
              onClick={() => setShowPublishModal(true)}
              disabled={!wallet.connected || !hasPinataConfig}
            >
              <Upload size={16} />
              Publish a Skill
            </button>

            {!wallet.connected && (
              <p className="text-muted">Connect your wallet to publish skills</p>
            )}
            {wallet.connected && !hasPinataConfig && (
              <p className="text-muted">Configure Pinata to store skill files</p>
            )}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <PublishSkillModal
          skills={mySkills}
          onPublish={handlePublish}
          onClose={() => setShowPublishModal(false)}
        />
      )}
    </div>
  )
}
