/* global document */ // Renderer callback.
const assert = require('node:assert/strict')

module.exports = async function checkPullRequests(app, page) {
  // GitHub is the controlled fixture boundary. App entry, rendered components,
  // preload and IPC serialization are real; no review is sent to GitHub.
  await app.evaluate(({ ipcMain }) => {
    const pr = { number: 7, title: 'Fixture pull request', state: 'open', draft: false, merged: false, user: { login: 'fixture' }, base: { ref: 'main', sha: 'a'.repeat(40) }, head: { ref: 'feature', sha: 'b'.repeat(40) } }
    globalThis.acceptanceReviews = []
    const data = {
      'github:status': { connected: true, login: 'fixture', mode: 'oauth', scopes: [] },
      'github:hasOAuthClient': false,
      'github:hasBundledClient': false,
      'github:repositories': [{ id: 1, owner: 'fixture', name: 'repo', fullName: 'fixture/repo', defaultBranch: 'main' }],
      'github:pullRequests': [pr],
      'github:listPullRequestReviewComments': [],
      'github:getPullRequestStatus': { overall: 'success', checks: [{ context: 'Fixture CI', state: 'success', source: 'check-run' }] },
      'github:getPullRequestFiles': [{ filename: 'fixture.ts', additions: 1, deletions: 1, status: 'modified', patch: '@@ -1 +1 @@\n-old\n+new' }]
    }
    for (const [channel, value] of Object.entries(data)) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => ({ success: true, data: value }))
    }
    ipcMain.removeHandler('github:compare')
    ipcMain.handle('github:compare', (_event, args) => {
      if (args.base !== 'a'.repeat(40) || args.head !== 'b'.repeat(40)) throw new Error('Diff must use reviewed commit SHAs')
      return { success: true, data: { status: 'ahead', aheadBy: 1, behindBy: 0, commits: [{ sha: 'b'.repeat(40), message: 'Fixture commit' }], files: [] } }
    })
    ipcMain.removeHandler('github:createPullRequestReview')
    ipcMain.handle('github:createPullRequestReview', (_event, payload) => {
      globalThis.acceptanceReviews.push(payload)
      if (globalThis.acceptanceReviews.length === 1) throw new Error('Fixture rejected submission')
      return { success: true, data: { id: 1 } }
    })
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await dialog.getByRole('tab', { name: 'GitHub', exact: true }).click()
  await dialog.getByRole('button', { name: 'Browse pull requests' }).click()
  await dialog.getByRole('button', { name: /Fixture pull request/ }).click()
  await dialog.getByText('Fixture CI', { exact: true }).waitFor()
  await dialog.getByText('fixture.ts', { exact: true }).waitFor()
  await dialog.getByText('Fixture commit', { exact: false }).waitFor()
  const draft = dialog.getByPlaceholder('Overall review summary (optional)')
  await draft.fill('Fixture review only')
  assert.equal(await app.evaluate(() => globalThis.acceptanceReviews.length), 0)
  const post = dialog.getByRole('button', { name: 'Post review', exact: true })
  await post.click()
  await page.getByText('Post review failed. Your draft is preserved; try again.', { exact: true }).waitFor()
  assert.equal(await draft.inputValue(), 'Fixture review only')
  await post.click()
  await page.waitForFunction(() => !document.querySelector('textarea[placeholder="Overall review summary (optional)"]').value)
  const reviews = await app.evaluate(() => globalThis.acceptanceReviews)
  assert.equal(reviews.length, 2)
  assert.deepEqual(reviews[1], { owner: 'fixture', repo: 'repo', number: 7, body: 'Fixture review only', event: 'COMMENT', comments: [] })
  await dialog.getByRole('button', { name: '+ Inline comment', exact: true }).click()
  await dialog.getByPlaceholder('path/to/file.ts').fill('fixture.ts')
  await dialog.getByPlaceholder('Inline comment body').fill('Fixture inline comment')
  await dialog.getByPlaceholder('line', { exact: true }).fill('bad')
  await post.click()
  await page.getByText('Each inline comment needs a positive whole-number line.', { exact: true }).waitFor()
  assert.equal(await app.evaluate(() => globalThis.acceptanceReviews.length), 2)
  await dialog.getByPlaceholder('line', { exact: true }).fill('1')
  await post.click()
  await dialog.getByPlaceholder('Inline comment body').waitFor({ state: 'hidden' })
  const inline = await app.evaluate(() => globalThis.acceptanceReviews[2].comments)
  assert.deepEqual(inline, [{ path: 'fixture.ts', body: 'Fixture inline comment', line: 1, side: 'RIGHT' }])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ appEntryNavigation: true, listDiffChecks: true, submissionOnlyAfterClick: true, rejectedSubmissionPreservesDraft: true, retryClearsDraft: true, githubBoundary: 'controlled IPC fixture; zero external submissions' }))
}
