import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import App from './App'
import { HabitsProvider } from './state/HabitsProvider'


/** Runs axe with the WCAG 2.x A/AA rules. jsdom can't compute colors, so contrast is checked in the browser and in palette.test.ts. */
async function violations(root: Element = document.body) {
  const result = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

function addHabit(name: string) {
  fireEvent.click(screen.getAllByRole('button', { name: /add (your first )?habit/i })[0]!)
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: name } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add habit' }))
}

describe('accessibility (axe, WCAG 2.2 AA)', () => {
  it('empty state has no violations', async () => {
    render(<HabitsProvider><App /></HabitsProvider>)
    expect(await violations()).toEqual([])
  })

  it('Today view with habits, done section open, has no violations', async () => {
    render(<HabitsProvider><App /></HabitsProvider>)
    addHabit('Read')
    addHabit('Walk')
    fireEvent.click(screen.getByRole('button', { name: /mark read done today/i }))
    expect(await violations()).toEqual([])
  })

  it('Week view has no violations', async () => {
    render(<HabitsProvider><App /></HabitsProvider>)
    addHabit('Read')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(await violations()).toEqual([])
  })

  it('new-habit dialog has no violations', async () => {
    render(<HabitsProvider><App /></HabitsProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add habit' }))
    expect(await violations(screen.getByRole('dialog'))).toEqual([])
  })

  it('announces check-ins to screen readers', () => {
    render(<HabitsProvider><App /></HabitsProvider>)
    addHabit('Read')
    fireEvent.click(screen.getByRole('button', { name: /mark read done today/i }))
    expect(screen.getAllByRole('status').some((s) => /Read done today\. 1 of 1 done today\./.test(s.textContent ?? ''))).toBe(true)
  })
})
