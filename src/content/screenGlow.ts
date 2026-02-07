const OVERLAY_ID = '__bouno-screen-glow'

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
  `

  el.appendChild(style)
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
