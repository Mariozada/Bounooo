import { type FC } from 'react'
import { ShoppingCart, Check, Tag, Download } from 'lucide-react'
import type { MarketplaceSkill } from '@marketplace/manager'
import { shortenAddress } from '@wallet/solana'

interface SkillCardProps {
  skill: MarketplaceSkill
  onBuy: (skill: MarketplaceSkill) => void
  isLoading?: boolean
  disabled?: boolean
}

export const SkillCard: FC<SkillCardProps> = ({
  skill,
  onBuy,
  isLoading = false,
  disabled = false,
}) => {
  const isFree = skill.price === 0
  const canBuy = !skill.installed && !disabled

  return (
    <div className="skill-card">
      <div className="skill-card-header">
        <h4 className="skill-card-name">{skill.name}</h4>
        <span className="skill-card-category">
          <Tag size={12} />
          {skill.category}
        </span>
      </div>

      <p className="skill-card-description">{skill.description}</p>

      <div className="skill-card-meta">
        <span className="skill-card-version">v{skill.version}</span>
        <span className="skill-card-seller" title={skill.seller}>
          by {shortenAddress(skill.seller)}
        </span>
        {skill.downloads > 0 && (
          <span className="skill-card-downloads">
            <Download size={11} />
            {skill.downloads}
          </span>
        )}
      </div>

      <div className="skill-card-footer">
        <span className="skill-card-price">
          {isFree ? 'Free' : `${skill.price} SOL`}
        </span>

        {skill.installed ? (
          <button className="button-secondary skill-card-installed" disabled>
            <Check size={14} />
            Installed
          </button>
        ) : (
          <button
            className="button-primary skill-card-buy"
            onClick={() => onBuy(skill)}
            disabled={!canBuy || isLoading}
            title={disabled ? 'Connect a wallet extension to purchase' : undefined}
          >
            {isLoading ? (
              'Processing...'
            ) : (
              <>
                <ShoppingCart size={14} />
                {isFree ? 'Get' : 'Buy'}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
