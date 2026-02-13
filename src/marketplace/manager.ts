import type { StoredSkill } from '@skills/types'
import type { PinataConfig } from './ipfs'
import { uploadToIPFS, uploadJSONToIPFS, fetchFromIPFS } from './ipfs'
import { createSkillMetadata } from './nft'
import { solToLamports, lamportsToSol, getConnection, type NetworkType } from '@wallet/solana'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { TREASURY_PUBLIC_KEY, COMMISSION_BPS, MIN_COMMISSION_LAMPORTS } from './config'
import { installSkillFromMarketplace, isSkillMintInstalled } from '@skills/storage'
import { invalidateSkillCache } from '@skills/manager'
import { loadSettings } from '@shared/settings'
import {
  listSkills as registryListSkills,
  searchSkills as registrySearchSkills,
  publishSkillListing,
  incrementDownloads,
  type SkillRow,
  type ListSkillsOptions,
} from './registry'

/**
 * Get current wallet address from settings (stored by background script)
 */
async function getWalletAddress(): Promise<string | null> {
  try {
    const settings = await loadSettings()
    if (settings.wallet?.connected && settings.wallet?.address) {
      return settings.wallet.address
    }
    return null
  } catch {
    return null
  }
}

export interface MarketplaceSkill {
  id: string          // Supabase row ID
  mint: string        // NFT mint address or Supabase ID (for non-NFT listings)
  name: string
  description: string
  price: number       // in SOL
  priceLamports: number
  seller: string
  ipfsCid: string
  category: string
  version: string
  image: string
  installed: boolean
  downloads: number
}

export interface PublishResult {
  success: boolean
  id?: string         // Supabase row ID
  mint?: string
  txId?: string
  error?: string
  errorType?: 'wallet' | 'balance' | 'ipfs' | 'blockchain' | 'validation' | 'unknown'
}

export interface PurchaseResult {
  success: boolean
  txId?: string
  signature?: string
  installedSkillId?: string
  error?: string
  errorType?: 'wallet' | 'network' | 'ipfs' | 'validation' | 'already_installed' | 'unknown'
}

/**
 * Convert Supabase row to MarketplaceSkill
 */
async function rowToSkill(row: SkillRow): Promise<MarketplaceSkill> {
  const installed = await isSkillMintInstalled(row.mint_address || row.id)
  return {
    id: row.id,
    mint: row.mint_address || row.id,
    name: row.name,
    description: row.description,
    price: lamportsToSol(row.price_lamports),
    priceLamports: row.price_lamports,
    seller: row.seller,
    ipfsCid: row.ipfs_cid,
    category: row.category,
    version: row.version,
    image: row.image_url || '',
    installed,
    downloads: row.downloads,
  }
}

/**
 * Browse available skills from Supabase registry
 */
export async function browseSkills(
  network: NetworkType = 'devnet',
  options?: { category?: string; limit?: number; offset?: number; orderBy?: ListSkillsOptions['orderBy'] }
): Promise<MarketplaceSkill[]> {
  try {
    const rows = await registryListSkills({
      category: options?.category,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
      orderBy: options?.orderBy || 'created_at',
    })
    return await Promise.all(rows.map(rowToSkill))
  } catch (error) {
    console.error('[Marketplace] browseSkills error:', error)
    return []
  }
}

/**
 * Search skills by query
 */
export async function searchMarketplaceSkills(query: string, limit = 20): Promise<MarketplaceSkill[]> {
  try {
    const rows = await registrySearchSkills(query, limit)
    return await Promise.all(rows.map(rowToSkill))
  } catch (error) {
    console.error('[Marketplace] searchSkills error:', error)
    return []
  }
}

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
    const walletAddress = await getWalletAddress()
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected', errorType: 'wallet' }
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

    // 4. Publish listing to Supabase registry
    const listing = await publishSkillListing({
      name: skill.name,
      description: skill.description,
      category,
      version: skill.version,
      price_lamports: priceLamports,
      seller: walletAddress,
      ipfs_cid: yamlUpload.cid,
      metadata_cid: metadataUpload.cid,
    })

    return { success: true, id: listing.id, mint: listing.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish skill'

    let errorType: PublishResult['errorType'] = 'unknown'
    const lowerMessage = message.toLowerCase()
    if (lowerMessage.includes('wallet') || lowerMessage.includes('connect')) {
      errorType = 'wallet'
    } else if (lowerMessage.includes('balance') || lowerMessage.includes('insufficient')) {
      errorType = 'balance'
    } else if (lowerMessage.includes('ipfs') || lowerMessage.includes('pinata') || lowerMessage.includes('upload')) {
      errorType = 'ipfs'
    }

    return { success: false, error: message, errorType }
  }
}

/**
 * Build a purchase transaction with commission split.
 * Returns a base64-encoded transaction for the wallet to sign.
 */
export async function buildPurchaseTransaction(
  buyerAddress: string,
  sellerAddress: string,
  totalLamports: number,
  network: NetworkType = 'devnet'
): Promise<{ transaction: string; sellerAmount: number; treasuryAmount: number }> {
  const connection = getConnection(network)
  const buyer = new PublicKey(buyerAddress)
  const seller = new PublicKey(sellerAddress)
  const treasury = new PublicKey(TREASURY_PUBLIC_KEY)

  // Calculate commission
  let treasuryAmount = Math.floor(totalLamports * COMMISSION_BPS / 10_000)
  if (treasuryAmount < MIN_COMMISSION_LAMPORTS && totalLamports > MIN_COMMISSION_LAMPORTS) {
    treasuryAmount = MIN_COMMISSION_LAMPORTS
  }
  const sellerAmount = totalLamports - treasuryAmount

  const tx = new Transaction()

  // Transfer to seller
  if (sellerAmount > 0) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: seller,
        lamports: sellerAmount,
      })
    )
  }

  // Transfer commission to treasury
  if (treasuryAmount > 0) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: treasury,
        lamports: treasuryAmount,
      })
    )
  }

  // Set recent blockhash and fee payer
  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = buyer

  // Serialize (unsigned) for the wallet to sign
  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64')

  return { transaction: serialized, sellerAmount, treasuryAmount }
}

/**
 * Purchase a skill from the marketplace
 */
export async function purchaseSkill(
  marketplaceSkill: MarketplaceSkill,
  network: NetworkType = 'devnet',
  signature?: string
): Promise<PurchaseResult> {
  try {
    const walletAddress = await getWalletAddress()
    const isFreeSkill = marketplaceSkill.price === 0

    if (!walletAddress && !isFreeSkill) {
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

    // For paid skills, verify the transaction landed on-chain
    if (!isFreeSkill && signature) {
      try {
        const connection = getConnection(network)
        const confirmation = await connection.confirmTransaction(signature, 'confirmed')
        if (confirmation.value.err) {
          return {
            success: false,
            error: 'Transaction failed on-chain: ' + JSON.stringify(confirmation.value.err),
            errorType: 'network'
          }
        }
        console.log('[Marketplace] Transaction confirmed on-chain:', signature)
      } catch (err) {
        console.error('[Marketplace] Transaction confirmation failed:', err)
        return {
          success: false,
          error: 'Could not confirm transaction on-chain. Please try again.',
          errorType: 'network'
        }
      }
    }

    // Fetch skill content from IPFS
    if (!marketplaceSkill.ipfsCid) {
      return {
        success: false,
        error: 'Skill has no IPFS content',
        errorType: 'validation'
      }
    }

    const yamlResult = await fetchFromIPFS(marketplaceSkill.ipfsCid)
    if (!yamlResult.success || !yamlResult.content) {
      return {
        success: false,
        error: 'Failed to fetch skill content from IPFS. The file may be unavailable.',
        errorType: 'ipfs'
      }
    }

    if (!yamlResult.content.includes('---') || !yamlResult.content.includes('name:')) {
      return {
        success: false,
        error: 'Invalid skill file format',
        errorType: 'validation'
      }
    }

    // Install skill locally
    const installedSkill = await installSkillFromMarketplace(
      yamlResult.content,
      {
        mint: marketplaceSkill.mint,
        seller: marketplaceSkill.seller,
        pricePaid: marketplaceSkill.priceLamports,
      }
    )

    invalidateSkillCache()

    // Increment download count in registry
    try {
      await incrementDownloads(marketplaceSkill.id)
    } catch {
      // Non-critical — don't fail the purchase
    }

    return {
      success: true,
      signature,
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
 * Get skills purchased by the current user (from local storage)
 */
export async function getMyPurchases(
  _network: NetworkType = 'devnet'
): Promise<MarketplaceSkill[]> {
  try {
    const { getMarketplaceSkills } = await import('@skills/storage')
    const marketplaceSkills = await getMarketplaceSkills()
    return marketplaceSkills.map(skill => ({
      id: skill.marketplaceData?.mint || skill.id,
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
      downloads: 0,
    }))
  } catch (error) {
    console.error('Failed to get purchases:', error)
    return []
  }
}
