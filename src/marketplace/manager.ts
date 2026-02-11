import type { StoredSkill } from '@skills/types'
import type { NetworkType } from '@wallet/solana'
import type { PinataConfig } from './ipfs'
import { uploadToIPFS, uploadJSONToIPFS, fetchFromIPFS } from './ipfs'
import {
  mintSkillNFT,
  getSkillNFTsByOwner,
  getSkillNFTMetadata,
  createSkillMetadata,
  type SkillNFT,
} from './nft'
import { getProvider, solToLamports, lamportsToSol, getBalance } from '@wallet/solana'
import { installSkillFromMarketplace, getMarketplaceSkills, isSkillMintInstalled } from '@skills/storage'

export interface MarketplaceSkill {
  mint: string
  name: string
  description: string
  price: number // in SOL
  priceLamports: number
  seller: string
  ipfsCid: string
  category: string
  version: string
  image: string
  installed: boolean
}

export interface PublishResult {
  success: boolean
  mint?: string
  txId?: string
  error?: string
  errorType?: 'wallet' | 'balance' | 'ipfs' | 'blockchain' | 'validation' | 'unknown'
}

export interface PurchaseResult {
  success: boolean
  txId?: string
  installedSkillId?: string
  error?: string
  errorType?: 'wallet' | 'network' | 'ipfs' | 'validation' | 'already_installed' | 'unknown'
}

// In-memory cache for demo purposes
// In production, use an indexer or backend
const skillListCache: Map<string, MarketplaceSkill[]> = new Map()

// Estimated transaction cost for minting NFT (in SOL)
const ESTIMATED_MINT_COST = 0.015 // ~0.015 SOL for account creation + tx fee

/**
 * Validate Pinata configuration
 */
function validatePinataConfig(config: PinataConfig): string | null {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return 'Pinata API key is required'
  }
  if (!config.secretKey || config.secretKey.trim() === '') {
    return 'Pinata secret key is required'
  }
  return null
}

/**
 * Publish a skill to the marketplace
 */
export async function publishSkill(
  skill: StoredSkill,
  priceSol: number,
  category: string,
  pinataConfig: PinataConfig,
  network: NetworkType = 'devnet'
): Promise<PublishResult> {
  try {
    // Validate wallet connection
    const provider = getProvider()
    if (!provider?.publicKey) {
      return { success: false, error: 'Wallet not connected', errorType: 'wallet' }
    }

    if (!provider.isConnected) {
      return { success: false, error: 'Wallet disconnected. Please reconnect.', errorType: 'wallet' }
    }

    // Validate Pinata config
    const pinataError = validatePinataConfig(pinataConfig)
    if (pinataError) {
      return { success: false, error: pinataError, errorType: 'validation' }
    }

    // Validate price
    if (priceSol < 0) {
      return { success: false, error: 'Price cannot be negative', errorType: 'validation' }
    }

    // Check balance for transaction fees
    const balance = await getBalance(provider.publicKey, network)
    if (balance < ESTIMATED_MINT_COST) {
      return {
        success: false,
        error: `Insufficient balance. You need at least ${ESTIMATED_MINT_COST} SOL for transaction fees. Current balance: ${balance.toFixed(4)} SOL`,
        errorType: 'balance'
      }
    }

    // 1. Upload skill YAML to IPFS
    const yamlUpload = await uploadToIPFS(
      skill.rawContent,
      `${skill.name}.skill.md`,
      pinataConfig
    )

    if (!yamlUpload.success || !yamlUpload.cid) {
      return {
        success: false,
        error: yamlUpload.error || 'Failed to upload skill to IPFS. Check your Pinata credentials.',
        errorType: 'ipfs'
      }
    }

    // 2. Create NFT metadata
    const priceLamports = solToLamports(priceSol)
    const metadata = createSkillMetadata(
      skill.name,
      skill.description,
      yamlUpload.cid,
      priceLamports,
      category,
      skill.version
    )

    // 3. Upload metadata to IPFS
    const metadataUpload = await uploadJSONToIPFS(
      metadata as unknown as Record<string, unknown>,
      `${skill.name}-metadata.json`,
      pinataConfig
    )

    if (!metadataUpload.success || !metadataUpload.cid) {
      return {
        success: false,
        error: metadataUpload.error || 'Failed to upload metadata to IPFS',
        errorType: 'ipfs'
      }
    }

    // 4. Mint NFT
    const metadataUri = `https://gateway.pinata.cloud/ipfs/${metadataUpload.cid}`
    const { mint, txId } = await mintSkillNFT(metadata, metadataUri, network)

    // 5. Add to cache
    const cacheKey = `${network}-all`
    const cached = skillListCache.get(cacheKey) || []
    cached.push({
      mint,
      name: skill.name,
      description: skill.description,
      price: priceSol,
      priceLamports,
      seller: provider.publicKey.toBase58(),
      ipfsCid: yamlUpload.cid,
      category,
      version: skill.version,
      image: metadata.image,
      installed: true, // We own it
    })
    skillListCache.set(cacheKey, cached)

    return { success: true, mint, txId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish skill'

    // Try to categorize the error
    let errorType: PublishResult['errorType'] = 'unknown'
    const lowerMessage = message.toLowerCase()

    if (lowerMessage.includes('wallet') || lowerMessage.includes('connect')) {
      errorType = 'wallet'
    } else if (lowerMessage.includes('balance') || lowerMessage.includes('insufficient') || lowerMessage.includes('lamports')) {
      errorType = 'balance'
    } else if (lowerMessage.includes('ipfs') || lowerMessage.includes('pinata') || lowerMessage.includes('upload')) {
      errorType = 'ipfs'
    } else if (lowerMessage.includes('transaction') || lowerMessage.includes('signature') || lowerMessage.includes('blockhash') || lowerMessage.includes('solana') || lowerMessage.includes('mint') || lowerMessage.includes('nft')) {
      errorType = 'blockchain'
    }

    return { success: false, error: message, errorType }
  }
}

/**
 * Browse available skills in the marketplace
 */
export async function browseSkills(
  network: NetworkType = 'devnet',
  forceRefresh = false
): Promise<MarketplaceSkill[]> {
  const cacheKey = `${network}-all`

  // Get skills from cache (or empty array)
  const skills = skillListCache.get(cacheKey) || []

  if (skills.length === 0) {
    return []
  }

  // Always update installed status from storage
  return await Promise.all(skills.map(async (skill) => ({
    ...skill,
    installed: await isSkillMintInstalled(skill.mint)
  })))
}

/**
 * Get skills listed by the current user
 */
export async function getMyListings(
  network: NetworkType = 'devnet'
): Promise<MarketplaceSkill[]> {
  const provider = getProvider()
  if (!provider?.publicKey || !provider.isConnected) {
    return []
  }

  // Store address immediately to avoid race condition
  const publicKey = provider.publicKey
  const address = publicKey.toBase58()

  try {
    const nfts = await getSkillNFTsByOwner(address, network)
    // Handle individual NFT conversion failures gracefully
    const results = await Promise.allSettled(nfts.map(nftToMarketplaceSkill))
    return results
      .filter((result): result is PromiseFulfilledResult<MarketplaceSkill> => result.status === 'fulfilled')
      .map(result => result.value)
  } catch (error) {
    console.error('Failed to get listings:', error)
    return []
  }
}

/**
 * Get skills purchased by the current user
 */
export async function getMyPurchases(
  network: NetworkType = 'devnet'
): Promise<MarketplaceSkill[]> {
  // Get from local storage instead of blockchain (more reliable)
  try {
    const marketplaceSkills = await getMarketplaceSkills()
    return marketplaceSkills.map(skill => ({
      mint: skill.marketplaceData?.mint || '',
      name: skill.name,
      description: skill.description,
      price: skill.marketplaceData?.pricePaid ? lamportsToSol(skill.marketplaceData.pricePaid) : 0,
      priceLamports: skill.marketplaceData?.pricePaid || 0,
      seller: skill.marketplaceData?.seller || '',
      ipfsCid: '',
      category: 'purchased',
      version: skill.version,
      image: '',
      installed: true,
    }))
  } catch (error) {
    console.error('Failed to get purchases:', error)
    return []
  }
}

/**
 * Purchase a skill from the marketplace
 */
export async function purchaseSkill(
  marketplaceSkill: MarketplaceSkill,
  network: NetworkType = 'devnet'
): Promise<PurchaseResult> {
  try {
    const provider = getProvider()
    if (!provider?.publicKey) {
      return { success: false, error: 'Wallet not connected', errorType: 'wallet' }
    }

    // Check if already installed
    const alreadyInstalled = await isSkillMintInstalled(marketplaceSkill.mint)
    if (alreadyInstalled) {
      return {
        success: false,
        error: 'This skill is already installed',
        errorType: 'already_installed'
      }
    }

    // 1. Get NFT metadata (for real purchases, verify on-chain)
    // For demo, we use the marketplaceSkill data directly

    // 2. For real implementation: Transfer payment to seller
    // For demo, we skip the actual payment

    // 3. Fetch skill YAML from IPFS
    if (!marketplaceSkill.ipfsCid || marketplaceSkill.ipfsCid.startsWith('QmDemo')) {
      // Demo skill - use placeholder content
      const demoContent = createDemoSkillContent(marketplaceSkill)

      const installedSkill = await installSkillFromMarketplace(
        demoContent,
        {
          mint: marketplaceSkill.mint,
          seller: marketplaceSkill.seller,
          pricePaid: marketplaceSkill.priceLamports,
        }
      )

      return {
        success: true,
        txId: 'demo-tx-' + Date.now(),
        installedSkillId: installedSkill.id,
      }
    }

    // Real IPFS fetch
    const yamlResult = await fetchFromIPFS(marketplaceSkill.ipfsCid)
    if (!yamlResult.success || !yamlResult.content) {
      return {
        success: false,
        error: 'Failed to fetch skill content from IPFS. The file may be unavailable.',
        errorType: 'ipfs'
      }
    }

    // 4. Validate the content is valid YAML
    if (!yamlResult.content.includes('---') || !yamlResult.content.includes('name:')) {
      return {
        success: false,
        error: 'Invalid skill file format',
        errorType: 'validation'
      }
    }

    // 5. Install skill locally with marketplace data
    const installedSkill = await installSkillFromMarketplace(
      yamlResult.content,
      {
        mint: marketplaceSkill.mint,
        seller: marketplaceSkill.seller,
        pricePaid: marketplaceSkill.priceLamports,
      }
    )

    // Update cache to reflect installed status
    const cacheKey = `${network}-all`
    const cached = skillListCache.get(cacheKey) || []
    const skillIndex = cached.findIndex(s => s.mint === marketplaceSkill.mint)
    if (skillIndex >= 0) {
      cached[skillIndex].installed = true
      skillListCache.set(cacheKey, cached)
    }

    return {
      success: true,
      txId: 'demo-tx-' + Date.now(),
      installedSkillId: installedSkill.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to purchase skill'
    return { success: false, error: message, errorType: 'unknown' }
  }
}

/**
 * Check if a skill is installed (by mint address)
 */
export async function checkSkillInstalled(mint: string): Promise<boolean> {
  return isSkillMintInstalled(mint)
}

/**
 * Escape a value for YAML output
 */
function escapeYamlValue(value: string): string {
  // Check if the value needs quoting
  const needsQuoting =
    value.includes(':') ||
    value.includes('#') ||
    value.includes("'") ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.startsWith('-') ||
    value.startsWith('[') ||
    value.startsWith('{')

  if (!needsQuoting) {
    return value
  }

  // Use double quotes and escape internal quotes
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `"${escaped}"`
}

/**
 * Create demo skill content for demo purchases
 */
function createDemoSkillContent(skill: MarketplaceSkill): string {
  const escapedName = escapeYamlValue(skill.name)
  const escapedDescription = escapeYamlValue(skill.description)
  const escapedVersion = escapeYamlValue(skill.version)

  return `---
name: ${escapedName}
description: ${escapedDescription}
version: ${escapedVersion}
author: Marketplace Demo
user-invocable: true
---

# ${skill.name}

This is a demo skill purchased from the marketplace.

## Instructions

${skill.description}

Follow the user's instructions to complete the task.
`
}

/**
 * Convert NFT to MarketplaceSkill
 */
async function nftToMarketplaceSkill(nft: SkillNFT): Promise<MarketplaceSkill> {
  const installed = await isSkillMintInstalled(nft.mint)
  return {
    mint: nft.mint,
    name: nft.name.replace('Bouno Skill: ', ''),
    description: nft.description,
    price: lamportsToSol(nft.price),
    priceLamports: nft.price,
    seller: nft.seller,
    ipfsCid: nft.skillYamlCid,
    category: nft.category,
    version: nft.version,
    image: nft.image,
    installed,
  }
}

/**
 * Add demo skills for testing
 */
export function addDemoSkills(): void {
  const demoSkills: MarketplaceSkill[] = [
    {
      mint: 'demo-mint-1',
      name: 'jupiter-swap',
      description: 'Swap any token pair on Jupiter DEX with natural language commands',
      price: 0.5,
      priceLamports: 500000000,
      seller: 'DemoSeller111111111111111111111111111111111',
      ipfsCid: 'QmDemo1',
      category: 'defi',
      version: '1.0.0',
      image: 'https://arweave.net/placeholder',
      installed: false,
    },
    {
      mint: 'demo-mint-2',
      name: 'nft-sniper',
      description: 'Monitor and automatically mint NFTs from new collections',
      price: 1.0,
      priceLamports: 1000000000,
      seller: 'DemoSeller222222222222222222222222222222222',
      ipfsCid: 'QmDemo2',
      category: 'consumer',
      version: '1.2.0',
      image: 'https://arweave.net/placeholder',
      installed: false,
    },
    {
      mint: 'demo-mint-3',
      name: 'airdrop-hunter',
      description: 'Find and claim airdrops across the Solana ecosystem',
      price: 0,
      priceLamports: 0,
      seller: 'DemoSeller333333333333333333333333333333333',
      ipfsCid: 'QmDemo3',
      category: 'defi',
      version: '2.0.0',
      image: 'https://arweave.net/placeholder',
      installed: false,
    },
  ]

  skillListCache.set('devnet-all', demoSkills)
}

// Initialize demo data
addDemoSkills()
