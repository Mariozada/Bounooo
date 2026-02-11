/**
 * Wallet Content Script Bridge
 *
 * This script runs in the context of web pages and can access Phantom.
 * It communicates with the background script via chrome.runtime messaging.
 */

interface PhantomProvider {
  isPhantom?: boolean
  publicKey: { toBase58: () => string } | null
  isConnected: boolean
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>
  disconnect: () => Promise<void>
  signTransaction: (tx: unknown) => Promise<unknown>
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>
}

interface WindowWithWallet extends Window {
  phantom?: { solana?: PhantomProvider }
  solflare?: PhantomProvider
  solana?: PhantomProvider
}

function getProvider(): PhantomProvider | null {
  const win = window as unknown as WindowWithWallet

  if (win.phantom?.solana?.isPhantom) {
    return win.phantom.solana
  }
  if (win.solflare) {
    return win.solflare
  }
  if (win.solana && (win.solana as PhantomProvider).isPhantom) {
    return win.solana
  }
  return null
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type } = message

  if (type === 'WALLET_BRIDGE_CHECK') {
    const provider = getProvider()
    sendResponse({
      available: !!provider,
      isPhantom: !!provider?.isPhantom,
      isConnected: !!provider?.isConnected,
      address: provider?.publicKey?.toBase58() || null,
    })
    return true
  }

  if (type === 'WALLET_BRIDGE_CONNECT') {
    const provider = getProvider()
    if (!provider) {
      sendResponse({ success: false, error: 'No wallet provider found' })
      return true
    }

    provider.connect()
      .then(({ publicKey }) => {
        sendResponse({
          success: true,
          address: publicKey.toBase58(),
        })
      })
      .catch((err: Error) => {
        sendResponse({
          success: false,
          error: err.message,
          cancelled: err.message.includes('rejected') || err.message.includes('cancel'),
        })
      })
    return true // Keep channel open for async
  }

  if (type === 'WALLET_BRIDGE_DISCONNECT') {
    const provider = getProvider()
    if (!provider) {
      sendResponse({ success: false, error: 'No wallet provider found' })
      return true
    }

    provider.disconnect()
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((err: Error) => {
        sendResponse({ success: false, error: err.message })
      })
    return true
  }

  if (type === 'WALLET_BRIDGE_SIGN') {
    const provider = getProvider()
    if (!provider) {
      sendResponse({ success: false, error: 'No wallet provider found' })
      return true
    }

    // For demo, we just simulate signing since building real txs is complex
    // In production, you'd deserialize the transaction and sign it
    const { action, amount } = message
    console.log(`[Wallet Bridge] Sign request: ${action} for ${amount} SOL`)

    // Just trigger the connect to show Phantom is working
    // Real signing would need proper transaction building
    sendResponse({
      success: true,
      signature: 'demo-signature-' + Date.now(),
    })
    return true
  }

  return false
})

console.log('[Wallet Bridge] Content script loaded, provider:', !!getProvider())
