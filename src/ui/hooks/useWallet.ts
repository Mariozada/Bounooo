import { useState, useEffect, useCallback } from 'react'
import {
  type WalletState,
  type NetworkType,
  connectWallet,
  disconnectWallet,
  getWalletState,
  getProvider,
  isWalletInstalled,
} from '@wallet/solana'

export interface UseWalletResult {
  wallet: WalletState
  isLoading: boolean
  error: string | null
  isInstalled: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
}

const DEFAULT_WALLET_STATE: WalletState = {
  connected: false,
  address: null,
  publicKey: null,
  balance: 0,
  network: 'devnet',
}

export function useWallet(network: NetworkType = 'devnet'): UseWalletResult {
  const [wallet, setWallet] = useState<WalletState>(DEFAULT_WALLET_STATE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  // Check if wallet is installed
  useEffect(() => {
    // Wait for window to be ready
    const checkInstalled = () => {
      setIsInstalled(isWalletInstalled())
    }

    // Check immediately
    checkInstalled()

    // Also check after a short delay (wallet injection can be async)
    const timeout = setTimeout(checkInstalled, 100)
    return () => clearTimeout(timeout)
  }, [])

  // Check existing connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const state = await getWalletState(network)
        setWallet(state)
      } catch (err) {
        console.error('Failed to check wallet connection:', err)
      }
    }

    if (isInstalled) {
      checkConnection()
    }
  }, [isInstalled, network])

  // Listen for wallet events
  useEffect(() => {
    const provider = getProvider()
    if (!provider) return

    const handleConnect = async () => {
      const state = await getWalletState(network)
      setWallet(state)
      setError(null)
    }

    const handleDisconnect = () => {
      setWallet(DEFAULT_WALLET_STATE)
    }

    const handleAccountChange = async () => {
      const state = await getWalletState(network)
      setWallet(state)
    }

    provider.on('connect', handleConnect)
    provider.on('disconnect', handleDisconnect)
    provider.on('accountChanged', handleAccountChange)

    return () => {
      provider.off('connect', handleConnect)
      provider.off('disconnect', handleDisconnect)
      provider.off('accountChanged', handleAccountChange)
    }
  }, [isInstalled, network])

  const connect = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const state = await connectWallet(network)
      setWallet(state)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [network])

  const disconnect = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await disconnectWallet()
      setWallet(DEFAULT_WALLET_STATE)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect wallet'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!wallet.connected) return

    setIsLoading(true)
    try {
      const state = await getWalletState(network)
      setWallet(state)
    } catch (err) {
      console.error('Failed to refresh wallet state:', err)
    } finally {
      setIsLoading(false)
    }
  }, [wallet.connected, network])

  return {
    wallet,
    isLoading,
    error,
    isInstalled,
    connect,
    disconnect,
    refresh,
  }
}
