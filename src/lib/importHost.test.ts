import { expect, it } from 'vitest'
import { importFromUrl, loadData, STORAGE_KEY } from './storage'

// This file runs on the default test origin (localhost), standing in for any real site.
it('ignores an #import= link anywhere except 127.0.0.1, so crafted links can’t inject data', () => {
  const payload = { version: 1, habits: [{ id: 'x', name: 'Injected', order: 0 }], completions: {}, settings: {} }
  history.replaceState(null, '', '/#import=' + encodeURIComponent(JSON.stringify(payload)))
  expect(importFromUrl()).toBe(false)
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(loadData().habits).toEqual([])
  history.replaceState(null, '', '/')
})
