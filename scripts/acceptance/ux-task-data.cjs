/* global window */
const assert = require('node:assert/strict')
module.exports = async function taskDataScenario({ page, ids, repo }) {
  const result = await page.evaluate(async ({ owner, repo }) => {
    const project = await window.api.projects.create({ name: 'UX21 project relationship', path: repo })
    if (!project.success) throw new Error(project.error)
    const assigned = await window.api.projects.assignConversation(owner, project.data.id)
    if (!assigned.success) throw new Error(assigned.error)
    const pinned = await window.api.sessions.setPinned(owner, true)
    if (!pinned.success) throw new Error(pinned.error)
    const fork = await window.api.conversation.fork(owner)
    if (!fork.success) throw new Error(fork.error)
    const archived = await window.api.sessions.archive(owner, true)
    if (!archived.success) throw new Error(archived.error)
    return { owner, projectId: project.data.id, forkId: fork.data.conversationId }
  }, { owner: ids[29], repo })
  await page.reload()
  const rows = await page.evaluate(async ids => ({
    conversations: (await window.api.conversation.list()).data,
    archived: (await window.api.sessions.list({ tab: 'archived' })).data,
    pinned: (await window.api.sessions.list({ tab: 'pinned' })).data,
    lineage: (await window.api.conversation.lineage(ids.forkId)).data,
    projects: (await window.api.projects.list()).data
  }), result)
  const task = rows.conversations.find(row => row.id === result.owner)
  const archived = rows.archived.find(row => row.id === result.owner)
  const fork = rows.conversations.find(row => row.id === result.forkId)
  assert(task && archived && fork)
  assert.equal(task.projectId, result.projectId)
  assert.equal(archived.projectId, result.projectId)
  assert.equal(task.archived, true)
  assert.equal(archived.pinnedAt, task.pinnedAt)
  assert.equal(fork.forkedFromId, result.owner)
  assert.equal(fork.projectId, result.projectId)
  assert.equal(new Set(rows.conversations.map(row => row.id)).size, rows.conversations.length)
  assert(rows.projects.some(row => row.id === result.projectId))
  const sessions = page.getByRole('button', { name: 'Sessions', exact: true })
  await sessions.click()
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  const panel = page.getByTestId('sessions-sidebar')
  await panel.getByText('UX21 project relationship', { exact: true }).waitFor()
  await panel.getByTitle(task.title, { exact: true }).waitFor()
  await sessions.click()
  return { realProjectAssignment: true, archivedAndPinnedMetadataSurvivesReload: true, forkLineageAndProjectPreserved: true, sameIdentityAcrossProjections: true, archivedTaskDiscoverable: true }
}
