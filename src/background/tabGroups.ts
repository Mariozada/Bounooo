interface ManagedGroup {
  groupId: number
  tabIds: Set<number>
  originTabId: number
}

class TabGroupService {
  private groups: Map<number, ManagedGroup> = new Map()
  private tabToGroup: Map<number, number> = new Map()

  async createGroup(tabId: number): Promise<number> {
    console.log('[TabGroups] Creating group for tab', tabId)

    const groupId = await chrome.tabs.group({ tabIds: [tabId] })

    await chrome.tabGroups.update(groupId, {
      title: 'Bouno',
      color: 'blue'
    })

    this.groups.set(groupId, {
      groupId,
      tabIds: new Set([tabId]),
      originTabId: tabId
    })
    this.tabToGroup.set(tabId, groupId)

    console.log('[TabGroups] Created group', groupId, 'for tab', tabId)
    return groupId
  }

  findGroupByTab(tabId: number): ManagedGroup | null {
    const groupId = this.tabToGroup.get(tabId)
    if (groupId === undefined) return null
    return this.groups.get(groupId) || null
  }

  async addTabToGroup(tabId: number, groupId: number): Promise<void> {
    console.log('[TabGroups] Adding tab', tabId, 'to group', groupId)

    const group = this.groups.get(groupId)
    if (!group) {
      console.warn('[TabGroups] Group not found:', groupId)
      return
    }

    await chrome.tabs.group({ tabIds: [tabId], groupId })

    group.tabIds.add(tabId)
    this.tabToGroup.set(tabId, groupId)

    await chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html?tabId=${tabId}&groupId=${groupId}`,
      enabled: true
    })

    console.log('[TabGroups] Tab', tabId, 'added to group', groupId)
  }

  removeTab(tabId: number): void {
    const groupId = this.tabToGroup.get(tabId)
    if (groupId === undefined) return

    const group = this.groups.get(groupId)
    if (group) {
      group.tabIds.delete(tabId)

      if (group.tabIds.size === 0) {
        this.groups.delete(groupId)
        console.log('[TabGroups] Group', groupId, 'removed (empty)')
      }
    }

    this.tabToGroup.delete(tabId)
    console.log('[TabGroups] Tab', tabId, 'removed from group', groupId)
  }

  async enablePanelForGroup(groupId: number): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) return

    console.log('[TabGroups] Enabling panel for group', groupId, 'tabs:', [...group.tabIds])

    for (const tabId of group.tabIds) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: `sidepanel.html?tabId=${tabId}&groupId=${groupId}`,
        enabled: true
      }).catch(() => {})
    }
  }

  async checkAndAdoptGroup(tabId: number): Promise<ManagedGroup | null> {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.groupId === -1 || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        return null
      }

      if (this.groups.has(tab.groupId)) {
        return this.groups.get(tab.groupId)!
      }

      console.log('[TabGroups] Adopting orphaned group', tab.groupId)

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

  getGroupTabs(groupId: number): number[] {
    const group = this.groups.get(groupId)
    return group ? [...group.tabIds] : []
  }

  isTabManaged(tabId: number): boolean {
    return this.tabToGroup.has(tabId)
  }
}

export const tabGroups = new TabGroupService()
