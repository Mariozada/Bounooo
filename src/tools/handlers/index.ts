export { registerTabTools } from './tabs'
export { registerPageReadingTools } from './pageReading'
export { registerInteractionTools, getScreenshot } from './interaction'
export { registerDebuggingTools, addConsoleMessage, addNetworkRequest, clearTabData } from './debugging'
export { registerMediaTools, addFrame } from './media'
export { registerUiTools, getCurrentPlan, clearPlan } from './ui'
export { registerOutputReadingTools } from './outputReading'

import { registerTabTools } from './tabs'
import { registerPageReadingTools } from './pageReading'
import { registerInteractionTools } from './interaction'
import { registerDebuggingTools } from './debugging'
import { registerMediaTools } from './media'
import { registerUiTools } from './ui'
import { registerOutputReadingTools } from './outputReading'

export function registerAllHandlers(): void {
  registerTabTools()
  registerPageReadingTools()
  registerInteractionTools()
  registerDebuggingTools()
  registerMediaTools()
  registerUiTools()
  registerOutputReadingTools()
}
