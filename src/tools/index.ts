/**
 * Tools Module Index
 *
 * This module provides:
 * 1. Tool definitions (metadata for prompts and AI SDK)
 * 2. Tool handlers (implementations for background script)
 * 3. Tool registry (execution infrastructure)
 */

// Registry exports
export { registerTool, executeTool, getRegisteredTools, hasTool } from './registry'

// Definitions exports
export {
  getAllToolDefinitions,
  getEnabledToolDefinitions,
  getToolsByCategory,
  getToolDefinition,
  setToolEnabled,
  isToolEnabled,
  resetToolStates,
  getToolNamesByCategory
} from './definitions'
export type { ToolDefinition, ToolParameter, ToolParameterType, ToolCategory } from './definitions'

// Handler exports
export {
  registerTabTools,
  registerPageReadingTools,
  registerInteractionTools,
  registerDebuggingTools,
  registerMediaTools,
  registerUiTools,
  registerAllHandlers,
  getScreenshot,
  addConsoleMessage,
  addNetworkRequest,
  clearTabData,
  addFrame,
  getCurrentPlan,
  clearPlan
} from './handlers'

// Convenience alias
export { registerAllHandlers as registerAllTools } from './handlers'
