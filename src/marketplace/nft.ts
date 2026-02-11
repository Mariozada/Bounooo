import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { Metaplex, walletAdapterIdentity } from '@metaplex-foundation/js'
import type { NetworkType } from '@wallet/solana'
import { getProvider } from '@wallet/solana'

export interface SkillNFTMetadata {
  name: string
  symbol: string
  description: string
  image: string
  externalUrl?: string
  attributes: Array<{
    trait_type: string
    value: string | number
  }>
  properties: {
    skill_yaml: string // IPFS URI to skill YAML
    price_lamports: number
    category: string
    version: string
  }
}

export interface SkillNFT {
  mint: string
  name: string
  description: string
  image: string
  seller: string
  price: number // in lamports
  skillYamlCid: string
  category: string
  version: string
  uri: string
}

// Collection address for Bouno Skills (to be set after initial mint)
let SKILL_COLLECTION_ADDRESS: string | null = null

export function setCollectionAddress(address: string): void {
  SKILL_COLLECTION_ADDRESS = address
}

export function getCollectionAddress(): string | null {
  return SKILL_COLLECTION_ADDRESS
}

function getMetaplex(network: NetworkType): Metaplex {
  const connection = new Connection(clusterApiUrl(network), 'confirmed')
  const provider = getProvider()

  if (!provider) {
    throw new Error('No wallet provider found. Please install Phantom or Solflare.')
  }

  if (!provider.publicKey) {
    throw new Error('Wallet not connected. Please connect your wallet first.')
  }

  if (!provider.isConnected) {
    throw new Error('Wallet is not connected. Please reconnect your wallet.')
  }

  // Create wallet adapter from Phantom provider
  const walletAdapter = {
    publicKey: provider.publicKey,
    signTransaction: provider.signTransaction.bind(provider),
    signAllTransactions: provider.signAllTransactions.bind(provider),
  }

  const metaplex = Metaplex.make(connection)
    .use(walletAdapterIdentity(walletAdapter as Parameters<typeof walletAdapterIdentity>[0]))

  return metaplex
}

export async function mintSkillNFT(
  metadata: SkillNFTMetadata,
  metadataUri: string,
  network: NetworkType = 'devnet'
): Promise<{ mint: string; txId: string }> {
  const metaplex = getMetaplex(network)
  const provider = getProvider()

  if (!provider?.publicKey) {
    throw new Error('Wallet not connected')
  }

  const { nft, response } = await metaplex.nfts().create({
    uri: metadataUri,
    name: metadata.name,
    symbol: metadata.symbol || 'SKILL',
    sellerFeeBasisPoints: 500, // 5% royalty
    creators: [
      {
        address: provider.publicKey,
        share: 100,
      },
    ],
    isMutable: true,
  })

  return {
    mint: nft.address.toBase58(),
    txId: response.signature,
  }
}

export async function listSkillNFTs(
  network: NetworkType = 'devnet'
): Promise<SkillNFT[]> {
  const connection = new Connection(clusterApiUrl(network), 'confirmed')
  const metaplex = Metaplex.make(connection)

  // If we have a collection, filter by it
  // Otherwise, we'll search by symbol
  const skills: SkillNFT[] = []

  try {
    // For demo, we'll use findAllByCreator or a known list
    // In production, you'd use a collection or indexer

    // Get NFTs with SKILL symbol
    // Note: This is a simplified approach - in production use an indexer
    const nfts = await metaplex.nfts().findAllByOwner({
      owner: new PublicKey('11111111111111111111111111111111'), // Placeholder
    })

    // This is a placeholder - in real implementation:
    // 1. Use a collection filter
    // 2. Or use an indexer like Helius
    // 3. Or maintain our own registry

    return skills
  } catch (error) {
    console.error('Failed to list skill NFTs:', error)
    return []
  }
}

export async function getSkillNFTsByOwner(
  ownerAddress: string,
  network: NetworkType = 'devnet'
): Promise<SkillNFT[]> {
  const connection = new Connection(clusterApiUrl(network), 'confirmed')
  const metaplex = Metaplex.make(connection)

  try {
    const owner = new PublicKey(ownerAddress)
    const nfts = await metaplex.nfts().findAllByOwner({ owner })

    const skills: SkillNFT[] = []

    for (const nft of nfts) {
      // Check if it's a skill NFT by symbol
      if (nft.symbol !== 'SKILL') continue

      try {
        // Load full metadata
        const fullNft = await metaplex.nfts().load({ metadata: nft })
        const json = fullNft.json

        if (!json) continue

        const properties = json.properties as SkillNFTMetadata['properties'] | undefined

        skills.push({
          mint: nft.address.toBase58(),
          name: nft.name,
          description: json.description || '',
          image: json.image || '',
          seller: nft.creators?.[0]?.address.toBase58() || '',
          price: properties?.price_lamports || 0,
          skillYamlCid: properties?.skill_yaml?.replace('ipfs://', '') || '',
          category: properties?.category || 'general',
          version: properties?.version || '1.0.0',
          uri: nft.uri,
        })
      } catch {
        // Skip NFTs that fail to load
        continue
      }
    }

    return skills
  } catch (error) {
    console.error('Failed to get skill NFTs by owner:', error)
    return []
  }
}

export async function transferSkillNFT(
  mintAddress: string,
  toAddress: string,
  network: NetworkType = 'devnet'
): Promise<string> {
  const metaplex = getMetaplex(network)
  const provider = getProvider()

  if (!provider?.publicKey) {
    throw new Error('Wallet not connected')
  }

  const mint = new PublicKey(mintAddress)
  const to = new PublicKey(toAddress)

  const nft = await metaplex.nfts().findByMint({ mintAddress: mint })

  const { response } = await metaplex.nfts().transfer({
    nftOrSft: nft,
    toOwner: to,
  })

  return response.signature
}

export async function getSkillNFTMetadata(
  mintAddress: string,
  network: NetworkType = 'devnet'
): Promise<SkillNFT | null> {
  const connection = new Connection(clusterApiUrl(network), 'confirmed')
  const metaplex = Metaplex.make(connection)

  try {
    const mint = new PublicKey(mintAddress)
    const nft = await metaplex.nfts().findByMint({ mintAddress: mint })

    if (!nft.json) {
      return null
    }

    const properties = nft.json.properties as SkillNFTMetadata['properties'] | undefined

    return {
      mint: mintAddress,
      name: nft.name,
      description: nft.json.description || '',
      image: nft.json.image || '',
      seller: nft.creators?.[0]?.address.toBase58() || '',
      price: properties?.price_lamports || 0,
      skillYamlCid: properties?.skill_yaml?.replace('ipfs://', '') || '',
      category: properties?.category || 'general',
      version: properties?.version || '1.0.0',
      uri: nft.uri,
    }
  } catch (error) {
    console.error('Failed to get skill NFT metadata:', error)
    return null
  }
}

export function createSkillMetadata(
  name: string,
  description: string,
  skillYamlCid: string,
  priceLamports: number,
  category: string,
  version: string,
  imageUrl: string = 'https://arweave.net/placeholder-skill-image' // Default placeholder
): SkillNFTMetadata {
  return {
    name: `Bouno Skill: ${name}`,
    symbol: 'SKILL',
    description,
    image: imageUrl,
    externalUrl: 'https://bouno.app',
    attributes: [
      { trait_type: 'category', value: category },
      { trait_type: 'version', value: version },
      { trait_type: 'price_sol', value: priceLamports / 1_000_000_000 },
    ],
    properties: {
      skill_yaml: `ipfs://${skillYamlCid}`,
      price_lamports: priceLamports,
      category,
      version,
    },
  }
}
