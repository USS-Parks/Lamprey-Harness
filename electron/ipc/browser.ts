import { ipcMain } from 'electron'
import * as bm from '../services/browser-manager'
import { browserCdpSessions } from '../services/browser-cdp-session'
import { browserDeveloperInspection } from '../services/browser-developer-inspection'
import { browserDeveloperObserver } from '../services/browser-developer-observer'
import {
  canonicalBrowserOrigin,
  setBrowserDeveloperSitePolicy,
  type BrowserDeveloperSiteDecision
} from '../services/browser-developer-policy'
import { patchSettings, readSettings } from '../services/settings-helper'

function developerTab(id?: string) {
  const tab = id ? bm.getTab(id) : bm.getActiveTab()
  if (!tab) throw new Error(id ? `Unknown browser tab ${id}` : 'No active browser tab')
  return tab
}

function siteDecision(url: string): { origin: string | null; decision: BrowserDeveloperSiteDecision } {
  const origin = canonicalBrowserOrigin(url)
  if (!origin) return { origin: null, decision: 'deny' }
  const policies = readSettings().browserDeveloperSitePolicies
  const raw = policies && typeof policies === 'object' && !Array.isArray(policies)
    ? (policies as Record<string, unknown>)[origin]
    : undefined
  return {
    origin,
    decision: raw === 'allow' || raw === 'deny' ? raw : 'ask'
  }
}

function developerStatus(id?: string) {
  const tab = id ? bm.getTab(id) : bm.getActiveTab()
  const enabled = readSettings().browserDeveloperModeEnabled === true
  if (!tab) {
    return { enabled, tabId: null, url: null, origin: null, siteDecision: 'deny', session: null, observation: null, evidence: [] }
  }
  const site = siteDecision(tab.url)
  return {
    enabled,
    tabId: tab.id,
    url: tab.url,
    origin: site.origin,
    siteDecision: site.decision,
    session: browserCdpSessions.get(tab.id),
    observation: browserDeveloperObserver.getStatus(tab.id),
    evidence: browserDeveloperInspection.listEvidence(tab.id)
  }
}

export function registerBrowserHandlers(): void {
  ipcMain.handle('browser:newTab', async (_e, args: { url?: string }) => {
    try {
      const tab = await bm.newTab(args?.url)
      return { success: true, data: { id: tab.id } }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'newTab failed' }
    }
  })

  ipcMain.handle('browser:closeTab', async (_e, args: { id: string }) => {
    try {
      bm.closeTab(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'closeTab failed' }
    }
  })

  ipcMain.handle('browser:setActiveTab', async (_e, args: { id: string }) => {
    try {
      bm.setActiveTab(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'setActiveTab failed' }
    }
  })

  ipcMain.handle('browser:navigate', async (_e, args: { id: string; url: string }) => {
    try {
      bm.navigate(args.id, args.url)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'navigate failed' }
    }
  })

  ipcMain.handle('browser:back', async (_e, args: { id: string }) => {
    try {
      bm.goBack(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'back failed' }
    }
  })

  ipcMain.handle('browser:forward', async (_e, args: { id: string }) => {
    try {
      bm.goForward(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'forward failed' }
    }
  })

  ipcMain.handle('browser:reload', async (_e, args: { id: string }) => {
    try {
      bm.reload(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'reload failed' }
    }
  })

  ipcMain.handle(
    'browser:setBounds',
    async (_e, args: { x: number; y: number; width: number; height: number }) => {
      try {
        bm.setBounds(args)
        return { success: true, data: true }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'setBounds failed' }
      }
    }
  )

  ipcMain.handle('browser:setVisible', async (_e, args: { visible: boolean }) => {
    try {
      bm.setVisible(!!args?.visible)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'setVisible failed' }
    }
  })

  ipcMain.handle('browser:listTabs', async () => {
    try {
      return { success: true, data: { tabs: bm.listTabs(), activeTabId: bm.getActiveTabId() } }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'listTabs failed' }
    }
  })

  ipcMain.handle('browser:developerStatus', async (_e, args?: { id?: string }) => {
    try {
      return { success: true, data: developerStatus(args?.id) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'developerStatus failed' }
    }
  })

  ipcMain.handle('browser:developerSetEnabled', async (_e, args: { enabled: boolean }) => {
    try {
      const enabled = args?.enabled === true
      patchSettings({ browserDeveloperModeEnabled: enabled })
      if (!enabled) {
        browserDeveloperObserver.clearAll()
        browserCdpSessions.detachDeveloperSessions()
      }
      return { success: true, data: developerStatus() }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'developerSetEnabled failed' }
    }
  })

  ipcMain.handle(
    'browser:developerSetSitePolicy',
    async (_e, args: { id?: string; decision: BrowserDeveloperSiteDecision }) => {
      try {
        if (!['allow', 'ask', 'deny'].includes(args?.decision)) {
          throw new Error('decision must be allow, ask, or deny')
        }
        const tab = developerTab(args?.id)
        const policy = setBrowserDeveloperSitePolicy(tab.url, args.decision)
        if (!policy.allowed) {
          browserDeveloperObserver.clearTarget(tab.id)
          browserCdpSessions.detach(tab.id)
        }
        return { success: true, data: developerStatus(tab.id) }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'developerSetSitePolicy failed' }
      }
    }
  )

  ipcMain.handle('browser:developerAttach', async (_e, args?: { id?: string }) => {
    try {
      const tab = developerTab(args?.id)
      bm.attachBrowserDeveloperSession(tab.id)
      await Promise.all([
        browserDeveloperObserver.observeConsole({ tab_id: tab.id, limit: 1 }),
        browserDeveloperObserver.observeNetwork({ tab_id: tab.id, limit: 1 })
      ])
      return { success: true, data: developerStatus(tab.id) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'developerAttach failed' }
    }
  })

  ipcMain.handle('browser:developerDetach', async (_e, args?: { id?: string }) => {
    try {
      const tab = developerTab(args?.id)
      browserDeveloperObserver.clearTarget(tab.id)
      browserCdpSessions.detach(tab.id)
      return { success: true, data: developerStatus(tab.id) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'developerDetach failed' }
    }
  })

  ipcMain.handle(
    'browser:developerCapture',
    async (_e, args?: { id?: string; annotations?: Array<{ label: string; x: number; y: number; width?: number; height?: number; color?: string }> }) => {
      try {
        const tab = developerTab(args?.id)
        const evidence = await browserDeveloperInspection.captureAnnotatedScreenshot({
          tab_id: tab.id,
          annotations: args?.annotations
        })
        return { success: true, data: { status: developerStatus(tab.id), evidence } }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'developerCapture failed' }
      }
    }
  )

  ipcMain.handle('browser:developerClear', async (_e, args?: { id?: string }) => {
    try {
      const tab = developerTab(args?.id)
      browserDeveloperObserver.clearObservations(tab.id)
      browserDeveloperInspection.clearEvidence(tab.id)
      return { success: true, data: developerStatus(tab.id) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'developerClear failed' }
    }
  })
}
