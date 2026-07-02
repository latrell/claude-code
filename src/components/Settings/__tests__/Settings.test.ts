/**
 * Tests for the Settings tab routing logic.
 *
 * After i18n localization of tab titles, /status, /config, and /usage all
 * opened the Status tab. Root cause: the Tabs component identifies tabs by
 * `id ?? title`, but Settings was only passing `title` (now translated) and
 * `defaultTab` was still English strings like 'Status'. The fix adds `id`
 * props with stable lowercase keys, and uses those same keys as defaultTab.
 */

import { describe, expect, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Simulate the Tabs component's internal tab identification logic
// (Tabs.tsx line 85):
//   const tabs = children.map(child => [child.props.id ?? child.props.title,
//                                       child.props.title]);
//   const controlledTabIndex = tabs.findIndex(tab =>
//     tab[0] === controlledSelectedTab);
// ---------------------------------------------------------------------------

type TabChildConfig = {
  id?: string
  key?: string
  title: string
}

type TabRecord = [id: string | undefined, title: string]

function buildTabRecords(children: TabChildConfig[]): TabRecord[] {
  return children.map(child => [child.id ?? child.title, child.title])
}

function findTabIndex(children: TabChildConfig[], selectedTab: string): number {
  const tabs = buildTabRecords(children)
  return tabs.findIndex(tab => tab[0] === selectedTab)
}

// Mock translation — in zh, tab titles are Chinese
function mockT(key: string): string {
  switch (key) {
    case 'Status':
      return '状态'
    case 'Config':
      return '配置'
    case 'Usage':
      return '用量'
    default:
      return key
  }
}

// ---------------------------------------------------------------------------
// Settings tab configuration — matches the real Settings.tsx
// ---------------------------------------------------------------------------

// BEFORE FIX: only title, no id
const tabChildrenBeforeFix: TabChildConfig[] = [
  { key: 'status', title: mockT('Status') },
  { key: 'config', title: mockT('Config') },
  { key: 'usage', title: mockT('Usage') },
]

// AFTER FIX: id + translated title
const tabChildrenAfterFix: TabChildConfig[] = [
  { id: 'status', key: 'status', title: mockT('Status') },
  { id: 'config', key: 'config', title: mockT('Config') },
  { id: 'usage', key: 'usage', title: mockT('Usage') },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings tab matching logic (simulated Tabs internal)', () => {
  describe('before fix — no id, translated title as identifier', () => {
    test('"Status" (English) does not match translated title', () => {
      // Before i18n, 'Status' matched because title was 'Status'.
      // After i18n, title is '状态' → match fails → fallback to index 0.
      const idx = findTabIndex(tabChildrenBeforeFix, 'Status')
      expect(idx).toBe(-1)
    })

    test('"Config" (English) does not match translated title', () => {
      const idx = findTabIndex(tabChildrenBeforeFix, 'Config')
      expect(idx).toBe(-1)
    })

    test('"Usage" (English) does not match translated title', () => {
      const idx = findTabIndex(tabChildrenBeforeFix, 'Usage')
      expect(idx).toBe(-1)
    })

    test('all English keys fail → Tabs falls back to index 0', () => {
      // This is the regression: any invalid selectedTab defaults to index 0,
      // which is Status. So /config and /usage both show Status.
      const results = ['Status', 'Config', 'Usage'].map(k =>
        findTabIndex(tabChildrenBeforeFix, k),
      )
      // All return -1 → Tabs component uses fallback index 0
      expect(results).toEqual([-1, -1, -1])
    })
  })

  describe('after fix — stable id prop, translated title for display', () => {
    test('"status" matches id "status" — opens Status tab', () => {
      const idx = findTabIndex(tabChildrenAfterFix, 'status')
      expect(idx).toBe(0)
    })

    test('"config" matches id "config" — opens Config tab', () => {
      const idx = findTabIndex(tabChildrenAfterFix, 'config')
      expect(idx).toBe(1)
    })

    test('"usage" matches id "usage" — opens Usage tab', () => {
      const idx = findTabIndex(tabChildrenAfterFix, 'usage')
      expect(idx).toBe(2)
    })

    test('translated titles do NOT match the stable ids (one-way)', () => {
      // The translated strings are not used as identifiers at all.
      const results = [mockT('Status'), mockT('Config'), mockT('Usage')].map(
        title => findTabIndex(tabChildrenAfterFix, title),
      )
      expect(results).toEqual([-1, -1, -1])
    })
  })

  describe('buildTabRecords — id takes precedence over title', () => {
    test('when id is present, title is not used as identifier', () => {
      const tabs = buildTabRecords(tabChildrenAfterFix)
      expect(tabs[0]![0]).toBe('status') // not '状态'
      expect(tabs[1]![0]).toBe('config') // not '配置'
      expect(tabs[2]![0]).toBe('usage') // not '用量'
    })

    test('title is still preserved in the record for rendering', () => {
      const tabs = buildTabRecords(tabChildrenAfterFix)
      expect(tabs[0]![1]).toBe('状态')
      expect(tabs[1]![1]).toBe('配置')
      expect(tabs[2]![1]).toBe('用量')
    })
  })
})
