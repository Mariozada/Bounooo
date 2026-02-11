# Wallet Integration for Bouno Skill Marketplace

## Overview

This wallet module enables **real Solana blockchain transactions** within the Bouno browser extension. It allows users to connect their Phantom/Solflare wallet to buy and sell agent skills as NFTs on Solana.

## The Problem We Solved

Chrome extension side panels and background scripts run in **isolated contexts** that cannot access `window.phantom` or `window.solflare`. Wallet extensions inject their providers into web page contexts only, not extension contexts.

**Solution**: We use a popup window approach. A dedicated HTML page (`wallet.html`) opens as a popup, runs in a web context, and CAN access Phantom. Results are communicated back via Chrome extension messaging.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MESSAGE FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MarketplaceTab.tsx          Background Script                   │
│  ┌──────────────────┐       ┌──────────────────┐                │
│  │ useWallet() hook │──────▶│ Message Handler  │                │
│  │                  │       │                  │                │
│  │ connect()        │ MSG:  │ Opens popup      │                │
│  │ requestSignature │ ────▶ │ window           │                │
│  └──────────────────┘       └────────┬─────────┘                │
│           ▲                          │                           │
│           │                          │ chrome.windows.create()   │
│           │                          ▼                           │
│           │                 ┌──────────────────┐                │
│           │                 │  wallet.html     │                │
│           │    MSG:         │  + popup.ts      │                │
│           │ WALLET_CONNECTED│                  │                │
│           └─────────────────│  Accesses        │                │
│                             │  window.phantom  │                │
│                             └──────────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/wallet/
├── CLAUDE.md          # This documentation
├── index.ts           # Exports (for direct provider access, legacy)
├── solana.ts          # Direct Solana/Phantom utilities (legacy)
└── popup.ts           # Popup window script (builds to wallet-popup.js)

public/
└── wallet.html        # Popup window HTML (copied to dist/)

src/ui/hooks/
└── useWallet.ts       # React hook for wallet state & operations

src/background/
└── index.ts           # Message handlers for wallet operations

src/shared/
└── messages.ts        # Wallet message type definitions
```

---

## Key Files Explained

### 1. `public/wallet.html`
The popup window that opens when connecting or signing. Contains:
- Loading state while detecting wallet
- "No wallet found" state with install links
- Connect button that triggers Phantom
- Transaction signing UI
- Success/error states

Loads `wallet-popup.js` which is built from `popup.ts`.

### 2. `src/wallet/popup.ts`
Runs inside the popup window. Key functions:

```typescript
// Detect Phantom/Solflare
function getProvider(): PhantomProvider | null

// Connect to wallet, send result to extension
async function connectWallet(): Promise<void>

// Sign a transaction, send result to extension
async function signTransaction(params: SignParams): Promise<void>

// Send results back to background script
function sendResult(type: string, data: Record<string, unknown>): void
```

### 3. `src/ui/hooks/useWallet.ts`
React hook used by MarketplaceTab. Provides:

```typescript
interface UseWalletResult {
  wallet: WalletState           // { connected, address, balance, network }
  isLoading: boolean
  error: string | null
  connect: () => Promise<void>  // Opens popup for connection
  disconnect: () => Promise<void>
  refresh: () => Promise<void>  // Fetches fresh balance (no popup)
  requestSignature: (params) => Promise<SignatureResult>  // Opens popup for signing
}
```

### 4. `src/background/index.ts` (wallet handlers)
Handles these message types:

| Message Type | Action |
|--------------|--------|
| `WALLET_POPUP_OPEN` | Opens wallet.html popup with mode param |
| `WALLET_CONNECT_RESULT` | Receives connection result from popup, saves to storage |
| `WALLET_SIGN_RESULT` | Receives signature result from popup |
| `WALLET_DISCONNECT` | Clears wallet state from storage |
| `WALLET_GET_STATE` | Returns current wallet state from storage |

### 5. `src/shared/messages.ts`
Defines wallet message types:

```typescript
WALLET_POPUP_OPEN      // Request to open popup
WALLET_CONNECT_RESULT  // Popup → Background: connection result
WALLET_CONNECTED       // Background → UI: wallet connected
WALLET_DISCONNECTED    // Background → UI: wallet disconnected
WALLET_DISCONNECT      // UI → Background: request disconnect
WALLET_SIGN_REQUEST    // UI → Background: request signature
WALLET_SIGN_RESULT     // Popup → Background: signature result
WALLET_TX_COMPLETE     // Background → UI: transaction complete
WALLET_GET_STATE       // UI → Background: get current state
```

---

## Message Flow Examples

### Connect Flow
```
1. User clicks "Connect Wallet" in MarketplaceTab
2. useWallet.connect() sends WALLET_POPUP_OPEN to background
3. Background opens wallet.html?mode=connect as popup
4. popup.ts detects Phantom, shows connect button
5. User clicks connect, Phantom shows its popup
6. User approves in Phantom
7. popup.ts sends WALLET_CONNECT_RESULT to background
8. Background saves address to chrome.storage
9. Background broadcasts WALLET_CONNECTED to all extension pages
10. useWallet receives message, updates state
11. Popup auto-closes after 1.5s
```

### Sign Transaction Flow
```
1. User clicks "Buy" on a paid skill
2. MarketplaceTab calls requestSignature({ action, amount, to })
3. useWallet sends WALLET_POPUP_OPEN with mode=sign
4. Background opens wallet.html?mode=sign&action=...&amount=...
5. popup.ts shows transaction details
6. User clicks "Approve in Wallet"
7. popup.ts calls provider.signTransaction()
8. Phantom shows transaction approval
9. User approves, transaction submitted to Solana
10. popup.ts sends WALLET_SIGN_RESULT with signature
11. Background broadcasts WALLET_TX_COMPLETE
12. useWallet resolves the promise with result
13. Popup auto-closes
```

---

## Build Configuration

The wallet popup is built separately:

**vite.config.wallet.ts**:
```typescript
export default defineConfig({
  build: {
    outDir: '../dist',
    lib: {
      entry: 'src/wallet/popup.ts',
      fileName: () => 'wallet-popup.js',
      formats: ['iife'],
    },
  },
})
```

**package.json**:
```json
{
  "build": "... && bun run build:wallet",
  "build:wallet": "vite build --config vite.config.wallet.ts"
}
```

---

## Testing Instructions

### Prerequisites
1. Install Phantom browser extension: https://phantom.app/
2. Create or import a wallet in Phantom
3. Switch Phantom to **Devnet**: Settings → Developer Settings → Devnet
4. Get devnet SOL: https://faucet.solana.com/ (paste your address)

### Test Connection
1. Build extension: `bun run build`
2. Load unpacked in Chrome: `chrome://extensions` → Load unpacked → select `dist/`
3. Open Bouno side panel on any webpage
4. Go to Settings → **Market** tab
5. Click **"Connect Wallet"**
6. A popup should open showing the Bouno wallet UI
7. Click "Connect with Phantom"
8. Phantom popup appears - click "Connect"
9. Popup should show "Connected!" with your address
10. Popup auto-closes
11. Market tab should show your wallet address and balance

### Test Disconnect
1. With wallet connected, click "Disconnect" in Market tab
2. Wallet state should reset to disconnected
3. Balance should show as 0

### Test Balance Refresh
1. With wallet connected, click the refresh icon
2. Balance should update from Solana RPC
3. No popup should open (balance is read-only)

### Test Buy Flow (Demo Skills)
1. Connect wallet
2. Click "Get" on the free "airdrop-hunter" skill
3. Skill should install without popup (demo skills skip signing)
4. Check Skills tab - skill should appear

### Test Buy Flow (Paid Skills)
1. Connect wallet with devnet SOL
2. Click "Buy" on a paid skill
3. Popup should open with transaction details
4. Click "Approve in Wallet"
5. Phantom shows transaction - approve it
6. Popup shows success, auto-closes
7. Skill should be installed

---

## Debugging

### Console Logs
The wallet integration logs to console with prefixes:
- `[Wallet]` - useWallet hook logs
- `[Marketplace]` - MarketplaceTab logs

### Common Issues

**Popup doesn't open:**
- Check background script console for errors
- Verify WALLET_POPUP_OPEN handler exists

**Phantom not detected:**
- Ensure Phantom extension is installed
- popup.ts waits 300ms + 500ms for injection
- Check popup console for provider detection

**Connection fails:**
- User may have rejected in Phantom
- Check for "cancelled" in error message

**Transaction fails:**
- Insufficient SOL balance
- Check Phantom is on correct network (devnet)

---

## Network Configuration

Currently hardcoded to **devnet** for hackathon safety:

```typescript
// popup.ts
const NETWORK = 'devnet'
const connection = new Connection(clusterApiUrl(NETWORK), 'confirmed')

// useWallet.ts
export function useWallet(network: NetworkType = 'devnet')
```

To switch to mainnet, update these values and ensure wallet is on mainnet-beta.

---

## Security Considerations

1. **No private keys** are ever handled by the extension
2. All signing happens in Phantom's secure context
3. Wallet address is stored in chrome.storage.local (extension-only)
4. Popup runs with same CSP as extension pages
5. Communication uses chrome.runtime messaging (secure)

---

## Integration with Marketplace

The wallet is used by the Skill Marketplace for:

1. **Publishing skills**: Mint skill as NFT (requires signature)
2. **Buying skills**: Transfer SOL to seller (requires signature)
3. **Ownership verification**: Check if user owns skill NFT

See `src/marketplace/manager.ts` for marketplace logic.
See `src/ui/components/settings/MarketplaceTab.tsx` for UI integration.

---

## Future Improvements

1. **Mainnet support**: Add network switcher in UI
2. **Transaction history**: Track past purchases
3. **Multi-wallet**: Support hardware wallets via Solana Wallet Adapter
4. **Better error UX**: More detailed error messages
5. **Offline detection**: Handle when RPC is unavailable
