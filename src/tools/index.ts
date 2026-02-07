export { registerTool, executeTool, getRegisteredTools, hasTool } from './registry'

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

export {
  registerTabTools,
  registerPageReadingTools,
  registerInteractionTools,
  registerDebuggingTools,
  registerMediaTools,
  registerUiTools,
  registerOutputReadingTools,
  registerAllHandlers,
  getScreenshot,
  addConsoleMessage,
  addNetworkRequest,
  clearTabData,
  addFrame,
  isGifRecordingActive,
  getCurrentPlan,
  clearPlan
} from './handlers'

export { registerAllHandlers as registerAllTools } from './handlers'
