import type { StoredSkill } from '@skills/types'
import type { PinataConfig } from './ipfs'
import { uploadToIPFS, uploadJSONToIPFS, fetchFromIPFS } from './ipfs'
import {
  mintSkillNFT,
  getSkillNFTsByOwner,
  createSkillMetadata,
  type SkillNFT,
} from './nft'
import { solToLamports, lamportsToSol, getConnection, type NetworkType } from '@wallet/solana'
import { PublicKey } from '@solana/web3.js'
import { installSkillFromMarketplace, getMarketplaceSkills, isSkillMintInstalled } from '@skills/storage'
import { invalidateSkillCache } from '@skills/manager'
import { loadSettings } from '@shared/settings'

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

// Valid demo mint addresses (whitelist for security)
const VALID_DEMO_MINTS = new Set([
  'demo-mint-1',
  'demo-mint-2',
  'demo-mint-3',
])

/**
 * Check if a mint is a valid demo mint
 */
function isValidDemoMint(mint: string): boolean {
  return VALID_DEMO_MINTS.has(mint)
}

/**
 * Check wallet balance
 */
async function checkWalletBalance(address: string, network: NetworkType): Promise<number> {
  try {
    const connection = getConnection(network)
    const publicKey = new PublicKey(address)
    const balance = await connection.getBalance(publicKey)
    return lamportsToSol(balance)
  } catch {
    return 0
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
    // Validate wallet connection using stored state (not direct provider)
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

    // Note: Balance check requires RPC call, skipping for now as the signing
    // will fail anyway if insufficient balance

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
      seller: walletAddress,
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
  _forceRefresh = false
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
  const walletAddress = await getWalletAddress()
  if (!walletAddress) {
    return []
  }

  try {
    const nfts = await getSkillNFTsByOwner(walletAddress, network)
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
  _network: NetworkType = 'devnet'
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
    const walletAddress = await getWalletAddress()
    const isDemoSkill = isValidDemoMint(marketplaceSkill.mint)
    const isFreeSkill = marketplaceSkill.price === 0

    // Reject unknown "demo-" prefixed mints that aren't in whitelist
    if (marketplaceSkill.mint.startsWith('demo-') && !isDemoSkill) {
      return { success: false, error: 'Invalid demo skill', errorType: 'validation' }
    }

    if (!walletAddress && !isDemoSkill && !isFreeSkill) {
      return { success: false, error: 'Wallet not connected', errorType: 'wallet' }
    }

    // Check balance for paid skills
    if (walletAddress && !isFreeSkill && !isDemoSkill && marketplaceSkill.price > 0) {
      const balance = await checkWalletBalance(walletAddress, network)
      if (balance < marketplaceSkill.price) {
        return {
          success: false,
          error: `Insufficient balance. You have ${balance.toFixed(4)} SOL but need ${marketplaceSkill.price} SOL`,
          errorType: 'wallet'
        }
      }
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

    // Demo skills — skip payment, install directly
    if (!marketplaceSkill.ipfsCid || marketplaceSkill.ipfsCid.startsWith('QmDemo')) {
      if (!isDemoSkill) {
        return {
          success: false,
          error: 'Cannot install: skill has no valid IPFS content',
          errorType: 'validation'
        }
      }
      const demoContent = createDemoSkillContent(marketplaceSkill)

      const installedSkill = await installSkillFromMarketplace(
        demoContent,
        {
          mint: marketplaceSkill.mint,
          seller: marketplaceSkill.seller,
          pricePaid: marketplaceSkill.priceLamports,
        }
      )

      invalidateSkillCache()

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
// Detailed instructions for each demo skill
const DEMO_SKILL_INSTRUCTIONS: Record<string, string> = {
  'jupiter-swap': `# Jupiter Token Swap

Swap tokens on Jupiter DEX (jup.ag), the leading Solana DEX aggregator.

## Instructions

1. Navigate to https://jup.ag
2. Use \`read_page\` to identify the swap interface
3. Set the "from" token:
   - Click the token selector for the input field
   - Search for the requested token name or symbol
   - Select it from the results
4. Set the "to" token:
   - Click the token selector for the output field
   - Search and select the target token
5. Enter the swap amount in the input field using \`form_input\`
6. Review the swap details (rate, price impact, minimum received)
7. If the user confirms, click "Swap" and wait for the wallet approval popup
8. After the transaction, verify the swap completed by checking the success message

## Notes
- Always show the user the exchange rate and price impact before confirming
- If price impact is > 5%, warn the user
- Common tokens: SOL, USDC, USDT, JUP, BONK, RAY, ORCA
- If a token isn't found, try searching by its contract address
`,

  'nft-sniper': `# NFT Collection Monitor

Monitor and mint NFTs from new Solana collections using Magic Eden or Tensor.

## Instructions

1. Ask the user which marketplace to use (Magic Eden or Tensor)
2. Navigate to the marketplace:
   - Magic Eden: https://magiceden.io/marketplace
   - Tensor: https://www.tensor.trade
3. For monitoring a collection:
   - Navigate to the collection page the user specifies
   - Use \`read_page\` to get current floor price, listed count, and volume
   - Report the key metrics to the user
4. For minting from a launchpad:
   - Navigate to the launchpad/mint page
   - Use \`read_page\` to find mint details (price, supply, date)
   - When mint is live, click the mint button
   - Wait for wallet approval
5. For buying a listed NFT:
   - Find the NFT the user wants
   - Click "Buy Now" or place a bid
   - Confirm the transaction details with the user before proceeding

## Notes
- Always confirm prices with the user before any purchase
- Check if the collection is verified on the marketplace
- Report floor price changes if monitoring
`,

  'airdrop-hunter': `# Solana Airdrop Finder

Find and check eligibility for airdrops across the Solana ecosystem.

## Instructions

1. Ask the user for their Solana wallet address (or use the connected wallet)
2. Check common airdrop aggregator sites:
   - Navigate to https://www.solanaairdrops.com or similar aggregators
   - Use \`read_page\` to find active and upcoming airdrops
3. For each potential airdrop:
   - Report the project name, token, and estimated value
   - Check eligibility criteria
   - Provide the claim link if available
4. To check a specific protocol's airdrop:
   - Navigate to the protocol's airdrop/claim page
   - Connect wallet if needed
   - Check if the address is eligible
   - Report the claimable amount
5. For claiming:
   - Navigate to the claim page
   - Click the claim button
   - Wait for wallet approval
   - Verify the tokens were received

## Notes
- Never share or ask for private keys or seed phrases
- Be cautious of phishing sites — verify URLs carefully
- Some airdrops require specific on-chain activity to qualify
- Free airdrops should never require sending tokens first
`,
}

function createDemoSkillContent(skill: MarketplaceSkill): string {
  const escapedName = escapeYamlValue(skill.name)
  const escapedDescription = escapeYamlValue(skill.description)
  const escapedVersion = escapeYamlValue(skill.version)

  const instructions = DEMO_SKILL_INSTRUCTIONS[skill.name] || `# ${skill.name}\n\n${skill.description}\n\nFollow the user's instructions to complete the task.\n`

  return `---
name: ${escapedName}
description: ${escapedDescription}
version: ${escapedVersion}
author: Marketplace Demo
user-invocable: true
auto-discover: true
---

${instructions}`
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
