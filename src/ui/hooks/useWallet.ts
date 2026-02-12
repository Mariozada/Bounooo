import { useState, useEffect, useCallback } from 'react'
import { MessageTypes } from '@shared/messages'
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js'

export type NetworkType = 'devnet' | 'mainnet-beta'

export interface WalletState {
  connected: boolean
  address: string | null
  balance: number
  network: NetworkType
}

export interface UseWalletResult {
  wallet: WalletState
  isLoading: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
  requestSignature: (params: SignatureRequest) => Promise<SignatureResult>
}

export interface SignatureRequest {
  action: string
  amount: number
  to: string
  transactionBase64?: string
}

export interface SignatureResult {
  success: boolean
  signature?: string
  error?: string
  cancelled?: boolean
}

const DEFAULT_WALLET_STATE: WalletState = {
  connected: false,
  address: null,
  balance: 0,
  network: 'devnet',
}

export function useWallet(network: NetworkType = 'devnet'): UseWalletResult {
  const [wallet, setWallet] = useState<WalletState>(DEFAULT_WALLET_STATE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load wallet state from storage on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageTypes.WALLET_GET_STATE })
      .then((response: { success: boolean; wallet?: WalletState }) => {
        if (response.success && response.wallet) {
          setWallet(response.wallet)
          // If connected, fetch fresh balance
          if (response.wallet.connected && response.wallet.address) {
            fetchBalance(response.wallet.address, network).then(balance => {
              setWallet(prev => ({ ...prev, balance }))
            })
          }
        }
      })
      .catch(err => {
        console.error('[Wallet] Failed to get state:', err)
      })
  }, [network])

  // Listen for wallet events from background (for external updates)
  useEffect(() => {
    const handleMessage = (message: {
      type: string
      address?: string
      balance?: number
      network?: string
      error?: string
    }) => {
      console.log('[Wallet] Received message:', message.type, message)

      if (message.type === MessageTypes.WALLET_CONNECTED) {
        setWallet({
          connected: true,
          address: message.address || null,
          balance: message.balance || 0,
          network: (message.network as NetworkType) || 'devnet',
        })
        setError(null)
        setIsLoading(false)
      }

      if (message.type === MessageTypes.WALLET_DISCONNECTED) {
        setWallet(DEFAULT_WALLET_STATE)
        if (message.error) {
          setError(message.error)
        }
        setIsLoading(false)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  // Fetch balance from RPC (no popup needed)
  const fetchBalance = async (address: string, net: NetworkType): Promise<number> => {
    try {
      const connection = new Connection(clusterApiUrl(net), 'confirmed')
      const pubkey = new PublicKey(address)
      const balance = await connection.getBalance(pubkey)
      return balance / LAMPORTS_PER_SOL
    } catch (err) {
      console.error('[Wallet] Failed to fetch balance:', err)
      return 0
    }
  }

  // Connect wallet (uses content script bridge)
  const connect = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageTypes.WALLET_POPUP_OPEN,
        mode: 'connect',
      }) as { success: boolean; address?: string; error?: string; cancelled?: boolean }

      if (!response.success) {
        if (response.cancelled) {
          // User cancelled - don't show as error
          setIsLoading(false)
          return
        }
        throw new Error(response.error || 'Failed to connect wallet')
      }

      // Use the response directly instead of waiting for broadcast
      if (response.address) {
        // Fetch balance for the connected address
        const balance = await fetchBalance(response.address, network)
        setWallet({
          connected: true,
          address: response.address,
          balance,
          network,
        })
        setIsLoading(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(message)
      setIsLoading(false)
      throw err
    }
  }, [network])

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await chrome.runtime.sendMessage({
        type: MessageTypes.WALLET_DISCONNECT,
      })
      setWallet(DEFAULT_WALLET_STATE)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect wallet'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refresh balance
  const refresh = useCallback(async () => {
    if (!wallet.connected || !wallet.address) return

    setIsLoading(true)
    try {
      const balance = await fetchBalance(wallet.address, wallet.network)
      setWallet(prev => ({ ...prev, balance }))
    } catch (err) {
      console.error('[Wallet] Failed to refresh:', err)
    } finally {
      setIsLoading(false)
    }
  }, [wallet.connected, wallet.address, wallet.network])

  // Request signature (uses content script bridge)
  const requestSignature = useCallback(async (params: SignatureRequest): Promise<SignatureResult> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageTypes.WALLET_POPUP_OPEN,
        mode: 'sign',
        signParams: {
          action: params.action,
          amount: params.amount,
          to: params.to,
          tx: params.transactionBase64,
        },
      }) as SignatureResult

      setIsLoading(false)
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      setError(message)
      setIsLoading(false)
      return {
        success: false,
        error: message,
      }
    }
  }, [])

  return {
    wallet,
    isLoading,
    error,
    connect,
    disconnect,
    refresh,
    requestSignature,
  }
}

// Utility to shorten address
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}
