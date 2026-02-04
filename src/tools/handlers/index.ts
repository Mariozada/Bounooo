/**
 * Tool Handlers Index
 *
 * Exports all handler registration functions and utilities.
 * These run in the background script (service worker).
 */

export { registerTabTools } from './tabs'
export { registerPageReadingTools } from './pageReading'
export { registerInteractionTools, getScreenshot } from './interaction'
export { registerDebuggingTools, addConsoleMessage, addNetworkRequest, clearTabData } from './debugging'
export { registerMediaTools, addFrame } from './media'
export { registerUiTools, getCurrentPlan, clearPlan } from './ui'

// Import for use within this module
import { registerTabTools } from './tabs'
import { registerPageReadingTools } from './pageReading'
import { registerInteractionTools } from './interaction'
import { registerDebuggingTools } from './debugging'
import { registerMediaTools } from './media'
import { registerUiTools } from './ui'

/**
 * Register all tool handlers with the registry
 */
export function registerAllHandlers(): void {
  registerTabTools()
  registerPageReadingTools()
  registerInteractionTools()
  registerDebuggingTools()
  registerMediaTools()
  registerUiTools()
}
