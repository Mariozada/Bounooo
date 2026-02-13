import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js'

export type NetworkType = 'devnet' | 'mainnet-beta'

export interface WalletState {
  connected: boolean
  address: string | null
  publicKey: PublicKey | null
  balance: number
  network: NetworkType
}

export interface PhantomProvider {
  isPhantom?: boolean
  publicKey: PublicKey | null
  isConnected: boolean
  signTransaction: (transaction: Transaction) => Promise<Transaction>
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>
  connect: () => Promise<{ publicKey: PublicKey }>
  disconnect: () => Promise<void>
  on: (event: string, callback: (...args: unknown[]) => void) => void
  off: (event: string, callback: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider
    }
    solflare?: PhantomProvider
    backpack?: PhantomProvider
    solana?: PhantomProvider
  }
}

const DEFAULT_NETWORK: NetworkType = 'devnet'

let currentConnection: Connection | null = null
let currentNetwork: NetworkType = DEFAULT_NETWORK

export function getConnection(network: NetworkType = currentNetwork): Connection {
  if (!currentConnection || currentNetwork !== network) {
    currentNetwork = network
    currentConnection = new Connection(clusterApiUrl(network), 'confirmed')
  }
  return currentConnection
}

export function getProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null

  // Try Phantom first
  if (window.phantom?.solana?.isPhantom) {
    return window.phantom.solana
  }

  // Try Solflare
  if (window.solflare) {
    return window.solflare
  }

  // Try Backpack
  if (window.backpack) {
    return window.backpack
  }

  // Try generic window.solana (some wallets inject here)
  if (window.solana) {
    return window.solana
  }

  return null
}

export function isWalletInstalled(): boolean {
  return getProvider() !== null
}

export async function connectWallet(network: NetworkType = DEFAULT_NETWORK): Promise<WalletState> {
  const provider = getProvider()

  if (!provider) {
    throw new Error('No Solana wallet found. Install Phantom, Solflare, or Backpack.')
  }

  try {
    const response = await provider.connect()
    const publicKey = response.publicKey
    const connection = getConnection(network)
    const balance = await connection.getBalance(publicKey)

    return {
      connected: true,
      address: publicKey.toBase58(),
      publicKey,
      balance: balance / LAMPORTS_PER_SOL,
      network,
    }
  } catch (error) {
    console.error('Failed to connect wallet:', error)
    throw error
  }
}

export async function disconnectWallet(): Promise<void> {
  const provider = getProvider()
  if (provider) {
    await provider.disconnect()
  }
}

export async function getWalletState(network: NetworkType = DEFAULT_NETWORK): Promise<WalletState> {
  const provider = getProvider()

  if (!provider || !provider.isConnected || !provider.publicKey) {
    return {
      connected: false,
      address: null,
      publicKey: null,
      balance: 0,
      network,
    }
  }

  const connection = getConnection(network)
  const balance = await connection.getBalance(provider.publicKey)

  return {
    connected: true,
    address: provider.publicKey.toBase58(),
    publicKey: provider.publicKey,
    balance: balance / LAMPORTS_PER_SOL,
    network,
  }
}

export async function getBalance(publicKey: PublicKey, network: NetworkType = DEFAULT_NETWORK): Promise<number> {
  const connection = getConnection(network)
  const balance = await connection.getBalance(publicKey)
  return balance / LAMPORTS_PER_SOL
}

export async function signTransaction(transaction: Transaction): Promise<Transaction> {
  const provider = getProvider()

  if (!provider || !provider.isConnected) {
    throw new Error('Wallet not connected')
  }

  return provider.signTransaction(transaction)
}

export async function signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
  const provider = getProvider()

  if (!provider || !provider.isConnected) {
    throw new Error('Wallet not connected')
  }

  return provider.signAllTransactions(transactions)
}

export async function signMessage(message: string): Promise<Uint8Array> {
  const provider = getProvider()

  if (!provider || !provider.isConnected) {
    throw new Error('Wallet not connected')
  }

  const encodedMessage = new TextEncoder().encode(message)
  const { signature } = await provider.signMessage(encodedMessage)
  return signature
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL)
}
