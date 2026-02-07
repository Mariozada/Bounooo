const OVERLAY_ID = '__bouno-screen-glow'
const BUTTON_ID = '__bouno-stop-button'

let overlay: HTMLDivElement | null = null

function createOverlay(): HTMLDivElement {
  const el = document.createElement('div')
  el.id = OVERLAY_ID
  el.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147483647',
    'pointer-events: none',
    'opacity: 0',
    'transition: opacity 0.4s ease',
  ].join(';')

  const style = document.createElement('style')
  style.textContent = `
    #${OVERLAY_ID}::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%) left center / 8% 100% no-repeat,
        linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%) right center / 8% 100% no-repeat,
        linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%) top center / 100% 8% no-repeat,
        linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%) bottom center / 100% 8% no-repeat;
      filter: blur(8px);
      animation: __bouno-glow-breathe 5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes __bouno-glow-breathe {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      25% {
        opacity: 0.975;
        transform: scale(1.03);
      }
      50% {
        opacity: 0.95;
        transform: scale(1.05);
      }
      75% {
        opacity: 0.975;
        transform: scale(1.03);
      }
    }

    #${BUTTON_ID} {
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 24px;
      border: 1px solid rgba(30, 144, 255, 0.3);
      border-radius: 999px;
      background: rgba(10, 10, 10, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #fff;
      font: 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    }

    #${BUTTON_ID}:hover {
      background: rgba(30, 30, 30, 0.9);
      border-color: rgba(30, 144, 255, 0.5);
    }

    #${BUTTON_ID} svg {
      flex-shrink: 0;
    }
  `

  // Stop button
  const btn = document.createElement('button')
  btn.id = BUTTON_ID
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>Stop Bouno`
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_AGENT' }).catch(() => {})
  })

  el.appendChild(style)
  el.appendChild(btn)
  document.documentElement.appendChild(el)
  return el
}

export function setScreenGlow(active: boolean): void {
  if (active) {
    if (!overlay || !overlay.isConnected) {
      overlay = createOverlay()
    }
    // Force reflow then fade in
    void overlay.offsetHeight
    overlay.style.opacity = '1'
  } else if (overlay && overlay.isConnected) {
    overlay.style.opacity = '0'
    setTimeout(() => {
      if (overlay && overlay.isConnected && overlay.style.opacity === '0') {
        overlay.remove()
        overlay = null
      }
    }, 400)
  }
}
