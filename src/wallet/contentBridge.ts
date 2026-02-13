/**
 * Wallet Content Script Bridge
 * This runs in ISOLATED world - communicates with background which
 * injects the MAIN world script via chrome.scripting.executeScript
 */

// Show overlay UI for wallet connection
function showConnectOverlay(available: boolean): Promise<{ success: boolean; address?: string; cancelled?: boolean }> {
  return new Promise((resolve) => {
    document.getElementById('bouno-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'bouno-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;font-family:system-ui';
    const c = available ? '#4ade80' : '#f87171';
    const t = available ? '✓ Wallet Detected' : '✗ No Wallet Found';
    const btn = available
      ? '<button id="bc" style="width:100%;padding:14px;font-size:16px;font-weight:600;border:none;border-radius:12px;cursor:pointer;background:linear-gradient(135deg,#ab9ff2,#6e56cf);color:#fff;margin-bottom:12px">Connect Wallet</button>'
      : '<a href="https://phantom.app" target="_blank" style="display:block;width:100%;padding:14px;font-size:16px;font-weight:600;border:none;border-radius:12px;background:linear-gradient(135deg,#ab9ff2,#6e56cf);color:#fff;text-decoration:none;margin-bottom:12px;box-sizing:border-box;text-align:center">Install a Wallet</a>';
    ov.innerHTML = '<div style="background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:20px;padding:32px;max-width:360px;width:90%;text-align:center;border:1px solid rgba(255,255,255,.1)"><div style="width:72px;height:72px;margin:0 auto 20px;background:linear-gradient(135deg,#ab9ff2,#6e56cf);border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:36px">👛</div><h2 style="color:#fff;margin:0 0 12px;font-size:22px">Connect Wallet</h2><p style="color:' + c + ';margin:0 0 8px;font-size:14px;font-weight:600">' + t + '</p><p style="color:#94a3b8;margin:0 0 24px;font-size:14px">' + (available ? 'Click to connect your Solana wallet' : 'Install Phantom or Solflare to continue') + '</p>' + btn + '<button id="bx" style="width:100%;padding:12px;font-size:14px;background:transparent;border:1px solid rgba(255,255,255,.2);border-radius:12px;color:#94a3b8;cursor:pointer">Cancel</button><p id="be" style="color:#f87171;margin:16px 0 0;font-size:13px;display:none;padding:10px;background:rgba(248,113,113,.1);border-radius:8px"></p></div>';
    document.body.appendChild(ov);
    const done = () => ov.remove();
    const bc = document.getElementById('bc');
    const bx = document.getElementById('bx');
    const be = document.getElementById('be');
    
    if (bc && available) {
      bc.onclick = async () => {
        bc.textContent = 'Connecting...';
        (bc as HTMLButtonElement).disabled = true;
        try {
          // Ask background to call connect in main world
          const result = await chrome.runtime.sendMessage({ type: 'PHANTOM_CONNECT' });
          if (result.success) {
            done();
            resolve({ success: true, address: result.address });
          } else if (result.cancelled) {
            done();
            resolve({ success: false, cancelled: true });
          } else {
            if (be) { be.textContent = result.error || 'Connection failed'; be.style.display = 'block'; }
            bc.textContent = 'Try Again';
            (bc as HTMLButtonElement).disabled = false;
          }
        } catch (e) {
          if (be) { be.textContent = (e as Error).message; be.style.display = 'block'; }
          bc.textContent = 'Try Again';
          (bc as HTMLButtonElement).disabled = false;
        }
      };
    }
    
    bx?.addEventListener('click', () => { done(); resolve({ success: false, cancelled: true }); });
    ov.onclick = (e) => { if (e.target === ov) { done(); resolve({ success: false, cancelled: true }); } };
  });
}

function showSignOverlay(action: string, amount: number): Promise<{ success: boolean; signature?: string; cancelled?: boolean }> {
  return new Promise((resolve) => {
    document.getElementById('bouno-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'bouno-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;font-family:system-ui';
    ov.innerHTML = '<div style="background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:20px;padding:32px;max-width:360px;width:90%;text-align:center;border:1px solid rgba(255,255,255,.1)"><div style="width:72px;height:72px;margin:0 auto 20px;background:linear-gradient(135deg,#4ade80,#22d3ee);border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:36px">✍️</div><h2 style="color:#fff;margin:0 0 8px;font-size:22px">Confirm</h2><p style="color:#94a3b8;margin:0 0 12px;font-size:14px">' + action + '</p><p style="color:#4ade80;margin:0 0 24px;font-size:28px;font-weight:700">' + amount + ' SOL</p><button id="ba" style="width:100%;padding:14px;font-size:16px;font-weight:600;border:none;border-radius:12px;cursor:pointer;background:linear-gradient(135deg,#4ade80,#22d3ee);color:#1a1a2e;margin-bottom:12px">Approve</button><button id="bx" style="width:100%;padding:12px;font-size:14px;background:transparent;border:1px solid rgba(255,255,255,.2);border-radius:12px;color:#94a3b8;cursor:pointer">Cancel</button></div>';
    document.body.appendChild(ov);
    const done = () => ov.remove();
    document.getElementById('ba')?.addEventListener('click', () => { done(); resolve({ success: true, signature: 'demo-' + Date.now() }); });
    document.getElementById('bx')?.addEventListener('click', () => { done(); resolve({ success: false, cancelled: true }); });
    ov.onclick = (e) => { if (e.target === ov) { done(); resolve({ success: false, cancelled: true }); } };
  });
}

// Message handler
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (!msg.type?.startsWith('WALLET_BRIDGE_')) return false;
  console.log('[Bouno:Wallet]', msg.type);

  (async () => {
    try {
      if (msg.type === 'WALLET_BRIDGE_CHECK') {
        // Ask background to check Phantom in main world
        const result = await chrome.runtime.sendMessage({ type: 'PHANTOM_CHECK' });
        send(result);
      } 
      else if (msg.type === 'WALLET_BRIDGE_CONNECT') {
        // First try eager connect
        try {
          const eager = await chrome.runtime.sendMessage({ type: 'PHANTOM_EAGER' });
          if (eager.success) {
            send({ success: true, address: eager.address });
            return;
          }
        } catch {}
        
        // Check if available and show overlay
        const check = await chrome.runtime.sendMessage({ type: 'PHANTOM_CHECK' });
        const result = await showConnectOverlay(check.available);
        send(result);
      }
      else if (msg.type === 'WALLET_BRIDGE_DISCONNECT') {
        await chrome.runtime.sendMessage({ type: 'PHANTOM_DISCONNECT' });
        send({ success: true });
      }
      else if (msg.type === 'WALLET_BRIDGE_SIGN') {
        const result = await showSignOverlay(msg.action || 'Purchase', msg.amount || 0);
        send(result);
      }
    } catch (e) {
      send({ success: false, error: (e as Error).message });
    }
  })();

  return true;
});

console.log('[Bouno:Wallet] Content script loaded');
