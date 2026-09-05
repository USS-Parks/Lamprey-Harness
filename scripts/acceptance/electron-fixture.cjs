// Boots the production bundle with real Electron/SQLite/IPC in an isolated profile.
// Window presentation and global shortcuts are suppressed so tests do not take focus.
const { app, BrowserWindow, globalShortcut } = require('electron')
const { resolve } = require('node:path')
const profile = process.env.LAMPREY_ACCEPTANCE_PROFILE
if (!profile) throw new Error('LAMPREY_ACCEPTANCE_PROFILE is required')
app.setPath('userData', profile)
app.setAppPath(resolve(__dirname, '../..'))
BrowserWindow.prototype.show = () => {}
BrowserWindow.prototype.showInactive = () => {}
BrowserWindow.prototype.focus = () => {}
globalShortcut.register = () => false
require(resolve(__dirname, '../../out/main/index.js'))
app.on('before-quit', () => console.error('ACCEPTANCE before-quit'))
app.on('will-quit', (event) => console.error('ACCEPTANCE will-quit prevented:', event.defaultPrevented))
app.on('quit', () => console.error('ACCEPTANCE quit'))
