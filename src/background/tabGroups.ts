/**
 * Tab Groups Service
 * Manages Chrome Tab Groups for BrowseRun side panel
 * Allows multiple tabs in the same group to share the panel session
 */

interface ManagedGroup {
  groupId: number           // Chrome's tab group ID
  tabIds: Set<number>       // Tabs in this group
  originTabId: number       // Tab that originally opened the panel
}

class TabGroupService {
  private groups: Map<number, ManagedGroup> = new Map()
  private tabToGroup: Map<number, number> = new Map() // tabId -> groupId

  /**
   * Create a new tab group when panel opens
   */
  async createGroup(tabId: number): Promise<number> {
    console.log('[TabGroups] Creating group for tab', tabId)

    // Create Chrome tab group
    const groupId = await chrome.tabs.group({ tabIds: [tabId] })

    // Style the group
    await chrome.tabGroups.update(groupId, {
      title: 'BrowseRun',
      color: 'blue'
    })

    // Track the group
    this.groups.set(groupId, {
      groupId,
      tabIds: new Set([tabId]),
      originTabId: tabId
    })
    this.tabToGroup.set(tabId, groupId)

    console.log('[TabGroups] Created group', groupId, 'for tab', tabId)
    return groupId
  }

  /**
   * Find which managed group a tab belongs to
   */
  findGroupByTab(tabId: number): ManagedGroup | null {
    const groupId = this.tabToGroup.get(tabId)
    if (groupId === undefined) return null
    return this.groups.get(groupId) || null
  }

  /**
   * Add a tab to an existing group
   */
  async addTabToGroup(tabId: number, groupId: number): Promise<void> {
    console.log('[TabGroups] Adding tab', tabId, 'to group', groupId)

    const group = this.groups.get(groupId)
    if (!group) {
      console.warn('[TabGroups] Group not found:', groupId)
      return
    }

    // Add to Chrome tab group
    await chrome.tabs.group({ tabIds: [tabId], groupId })

    // Track
    group.tabIds.add(tabId)
    this.tabToGroup.set(tabId, groupId)

    // Enable panel for the new tab
    await chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html?tabId=${tabId}&groupId=${groupId}`,
      enabled: true
    })

    console.log('[TabGroups] Tab', tabId, 'added to group', groupId)
  }

  /**
   * Remove a tab from its group
   */
  removeTab(tabId: number): void {
    const groupId = this.tabToGroup.get(tabId)
    if (groupId === undefined) return

    const group = this.groups.get(groupId)
    if (group) {
      group.tabIds.delete(tabId)

      // If group is empty, remove it
      if (group.tabIds.size === 0) {
        this.groups.delete(groupId)
        console.log('[TabGroups] Group', groupId, 'removed (empty)')
      }
    }

    this.tabToGroup.delete(tabId)
    console.log('[TabGroups] Tab', tabId, 'removed from group', groupId)
  }

  /**
   * Enable panel for all tabs in a group
   */
  async enablePanelForGroup(groupId: number): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) return

    console.log('[TabGroups] Enabling panel for group', groupId, 'tabs:', [...group.tabIds])

    for (const tabId of group.tabIds) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: `sidepanel.html?tabId=${tabId}&groupId=${groupId}`,
        enabled: true
      }).catch(() => {
        // Tab might not exist anymore
      })
    }
  }

  /**
   * Check if a Chrome tab group exists and adopt it if orphaned
   */
  async checkAndAdoptGroup(tabId: number): Promise<ManagedGroup | null> {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.groupId === -1 || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        return null // Tab is not in any group
      }

      // Check if we're already managing this group
      if (this.groups.has(tab.groupId)) {
        return this.groups.get(tab.groupId)!
      }

      // Adopt the orphaned group
      console.log('[TabGroups] Adopting orphaned group', tab.groupId)

      // Get all tabs in this Chrome group
      const tabsInGroup = await chrome.tabs.query({ groupId: tab.groupId })
      const tabIds = new Set(tabsInGroup.map(t => t.id!).filter(id => id !== undefined))

      const group: ManagedGroup = {
        groupId: tab.groupId,
        tabIds,
        originTabId: tabId
      }

      this.groups.set(tab.groupId, group)
      for (const tid of tabIds) {
        this.tabToGroup.set(tid, tab.groupId)
      }

      return group
    } catch {
      return null
    }
  }

  /**
   * Get all tabs in a group
   */
  getGroupTabs(groupId: number): number[] {
    const group = this.groups.get(groupId)
    return group ? [...group.tabIds] : []
  }

  /**
   * Check if tab is in a managed group
   */
  isTabManaged(tabId: number): boolean {
    return this.tabToGroup.has(tabId)
  }
}

export const tabGroups = new TabGroupService()
