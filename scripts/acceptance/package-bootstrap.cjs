// Preloaded by the packaged executable; the probe app verifies this before
// any real application code is allowed to start.
const { app, BrowserWindow, globalShortcut } = require('electron')
const { realpathSync } = require('node:fs')
const profile = process.env.LAMPREY_ACCEPTANCE_PROFILE
if (!profile) throw new Error('An isolated package acceptance profile is required')
app.setPath('userData', realpathSync(profile))
// The launch pause is only for the main entry; workers should start normally.
process.execArgv = process.execArgv.filter(arg => !arg.startsWith('--inspect'))
const workerThreads = require('node:worker_threads')
const Worker = workerThreads.Worker
workerThreads.Worker = class extends Worker {
  constructor(file, options = {}) {
    super(file, { ...options, execArgv: (options.execArgv || process.execArgv).filter(arg => !arg.startsWith('--inspect')) })
  }
}
BrowserWindow.prototype.show = () => {}
BrowserWindow.prototype.showInactive = () => {}
BrowserWindow.prototype.focus = () => {}
globalShortcut.register = () => false
global.__lampreyPackageBootstrap = true
global.__lampreyPackageInfo = () => ({ version: app.getVersion(), packaged: app.isPackaged, userData: app.getPath('userData'), appPath: app.getAppPath() })
global.__lampreyPackageQuit = () => app.quit()
// Authored and reviewed by Basho Parks, copyright 2026
