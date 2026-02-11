/**
 * Wallet Popup Script
 *
 * This script runs in the wallet.html popup window.
 * It can access Phantom/Solflare because it runs in a web context.
 */

import { Connection, PublicKey, Transaction, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js'

// Types
interface PhantomProvider {
  isPhantom?: boolean
  publicKey: PublicKey | null
  isConnected: boolean
  signTransaction: (transaction: Transaction) => Promise<Transaction>
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>
  connect: () => Promise<{ publicKey: PublicKey }>
  disconnect: () => Promise<void>
}

interface WindowWithWallet extends Window {
  phantom?: {
    solana?: PhantomProvider
  }
  solflare?: PhantomProvider
  solana?: PhantomProvider // Some wallets inject directly to window.solana
}

type PopupMode = 'connect' | 'sign' | 'disconnect'

interface SignParams {
  action: string
  amount: number
  to: string
  transactionBase64?: string
}

// Constants
const NETWORK = 'devnet'
const connection = new Connection(clusterApiUrl(NETWORK), 'confirmed')

// DOM Elements
const sections = {
  loading: document.getElementById('loading'),
  noWallet: document.getElementById('no-wallet'),
  connect: document.getElementById('connect'),
  connected: document.getElementById('connected'),
  sign: document.getElementById('sign'),
  txSuccess: document.getElementById('tx-success'),
  error: document.getElementById('error'),
}

// Show a specific section
function showSection(sectionId: keyof typeof sections): void {
  Object.values(sections).forEach(s => s?.classList.remove('active'))
  sections[sectionId]?.classList.add('active')
}

// Get the wallet provider
function getProvider(): PhantomProvider | null {
  const win = window as WindowWithWallet

  // Log what we find for debugging
  console.log('[Wallet Popup] Checking providers:', {
    'window.phantom': !!win.phantom,
    'window.phantom.solana': !!win.phantom?.solana,
    'window.phantom.solana.isPhantom': !!win.phantom?.solana?.isPhantom,
    'window.solflare': !!win.solflare,
    'window.solana': !!win.solana,
  })

  // Try Phantom first (preferred)
  if (win.phantom?.solana?.isPhantom) {
    return win.phantom.solana
  }

  // Try Solflare
  if (win.solflare) {
    return win.solflare
  }

  // Try generic window.solana (some wallets use this)
  if (win.solana && (win.solana as PhantomProvider).isPhantom) {
    return win.solana
  }

  return null
}

// Get URL parameters to determine mode
function getParams(): { mode: PopupMode; signParams?: SignParams } {
  const params = new URLSearchParams(window.location.search)
  const mode = (params.get('mode') || 'connect') as PopupMode

  let signParams: SignParams | undefined
  if (mode === 'sign') {
    signParams = {
      action: params.get('action') || 'Transaction',
      amount: parseFloat(params.get('amount') || '0'),
      to: params.get('to') || '',
      transactionBase64: params.get('tx') || undefined,
    }
  }

  return { mode, signParams }
}

// Send result back to extension
function sendResult(type: string, data: Record<string, unknown>): void {
  chrome.runtime.sendMessage({
    type,
    ...data,
  }).catch(err => {
    console.error('Failed to send message:', err)
  })
}

// Close popup after delay
function closeAfterDelay(ms: number = 2000): void {
  setTimeout(() => {
    window.close()
  }, ms)
}

// Format address for display
function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Connect to wallet
async function connectWallet(): Promise<void> {
  const provider = getProvider()
  if (!provider) {
    showSection('noWallet')
    return
  }

  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
  const errorEl = document.getElementById('connect-error') as HTMLElement

  connectBtn.disabled = true
  connectBtn.textContent = 'Connecting...'
  errorEl.style.display = 'none'

  try {
    const { publicKey } = await provider.connect()
    const address = publicKey.toBase58()

    // Get balance
    const balance = await connection.getBalance(publicKey)
    const balanceSol = balance / LAMPORTS_PER_SOL

    // Update UI
    const addressEl = document.getElementById('wallet-address')
    const balanceEl = document.getElementById('wallet-balance')
    if (addressEl) addressEl.textContent = shortenAddress(address)
    if (balanceEl) balanceEl.textContent = `${balanceSol.toFixed(4)} SOL`

    showSection('connected')

    // Send result to extension
    sendResult('WALLET_CONNECT_RESULT', {
      success: true,
      address,
      publicKey: address,
      balance: balanceSol,
      network: NETWORK,
    })

    // Close after showing success
    closeAfterDelay(1500)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect'
    errorEl.textContent = message
    errorEl.style.display = 'block'
    connectBtn.disabled = false
    connectBtn.textContent = 'Connect with Phantom'

    // If user rejected, just close
    if (message.includes('rejected') || message.includes('cancelled')) {
      sendResult('WALLET_CONNECT_RESULT', {
        success: false,
        error: 'User rejected connection',
        cancelled: true,
      })
      closeAfterDelay(1000)
    }
  }
}

// Sign a transaction
async function signTransaction(params: SignParams): Promise<void> {
  const provider = getProvider()
  if (!provider) {
    showSection('noWallet')
    return
  }

  // Update UI with transaction details
  const actionEl = document.getElementById('tx-action')
  const amountEl = document.getElementById('tx-amount')
  const toEl = document.getElementById('tx-to')

  if (actionEl) actionEl.textContent = params.action
  if (amountEl) amountEl.textContent = `${params.amount} SOL`
  if (toEl) toEl.textContent = shortenAddress(params.to)

  showSection('sign')

  const signBtn = document.getElementById('sign-btn') as HTMLButtonElement
  const errorEl = document.getElementById('sign-error') as HTMLElement

  signBtn.onclick = async () => {
    signBtn.disabled = true
    signBtn.textContent = 'Waiting for approval...'
    errorEl.style.display = 'none'

    try {
      // Ensure connected
      if (!provider.isConnected) {
        await provider.connect()
      }

      // If we have a transaction to sign
      if (params.transactionBase64) {
        const txBuffer = Buffer.from(params.transactionBase64, 'base64')
        const transaction = Transaction.from(txBuffer)

        const signedTx = await provider.signTransaction(transaction)
        const signature = await connection.sendRawTransaction(signedTx.serialize())

        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed')

        // Show success
        const sigEl = document.getElementById('tx-signature')
        if (sigEl) sigEl.textContent = signature
        showSection('txSuccess')

        sendResult('WALLET_SIGN_RESULT', {
          success: true,
          signature,
        })

        closeAfterDelay(2000)
      } else {
        // For demo, just simulate success
        showSection('txSuccess')

        sendResult('WALLET_SIGN_RESULT', {
          success: true,
          signature: 'demo-signature-' + Date.now(),
        })

        closeAfterDelay(1500)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      errorEl.textContent = message
      errorEl.style.display = 'block'
      signBtn.disabled = false
      signBtn.textContent = 'Approve in Wallet'

      if (message.includes('rejected') || message.includes('cancelled')) {
        sendResult('WALLET_SIGN_RESULT', {
          success: false,
          error: 'User rejected transaction',
          cancelled: true,
        })
        closeAfterDelay(1000)
      }
    }
  }
}

// Cancel transaction
function cancelTransaction(): void {
  sendResult('WALLET_SIGN_RESULT', {
    success: false,
    error: 'User cancelled',
    cancelled: true,
  })
  window.close()
}

// Make cancel function available globally
;(window as unknown as { cancelTransaction: typeof cancelTransaction }).cancelTransaction = cancelTransaction

// Wait for wallet provider to be available
async function waitForProvider(maxAttempts = 20, interval = 200): Promise<PhantomProvider | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const provider = getProvider()
    if (provider) {
      console.log(`[Wallet Popup] Provider found after ${i * interval}ms`)
      return provider
    }
    console.log(`[Wallet Popup] Waiting for provider... attempt ${i + 1}/${maxAttempts}`)
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  return null
}

// Initialize popup
async function init(): Promise<void> {
  const { mode, signParams } = getParams()
  console.log('[Wallet Popup] Init with mode:', mode)

  // Wait for wallet provider with retries (up to 4 seconds)
  const provider = await waitForProvider()

  if (!provider) {
    console.log('[Wallet Popup] No provider found after waiting')
    showSection('noWallet')
    return
  }

  console.log('[Wallet Popup] Provider found:', provider.isPhantom ? 'Phantom' : 'Other')

  switch (mode) {
    case 'connect':
      showSection('connect')
      // Set up connect button
      const connectBtn = document.getElementById('connect-btn')
      if (connectBtn) {
        connectBtn.onclick = connectWallet
      }
      break

    case 'sign':
      if (signParams) {
        await signTransaction(signParams)
      }
      break

    case 'disconnect':
      try {
        await provider.disconnect()
        sendResult('WALLET_DISCONNECT_RESULT', { success: true })
      } catch (err) {
        sendResult('WALLET_DISCONNECT_RESULT', {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to disconnect',
        })
      }
      closeAfterDelay(500)
      break
  }
}

// Start
init().catch(err => {
  console.error('Popup init error:', err)
  const errorEl = document.getElementById('error-message')
  if (errorEl) errorEl.textContent = err.message
  showSection('error')
})
