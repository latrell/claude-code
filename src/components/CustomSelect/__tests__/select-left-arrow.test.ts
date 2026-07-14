import { expect, test } from 'bun:test'
import { shouldHandleSelectLeftArrow } from '../use-select-input.js'

test('left arrow returns from a regular select option', () => {
  expect(shouldHandleSelectLeftArrow(true, false)).toBe(true)
})

test('left arrow stays available for cursor movement in an input option', () => {
  expect(shouldHandleSelectLeftArrow(true, true)).toBe(false)
})

test('other keys do not trigger left-arrow navigation', () => {
  expect(shouldHandleSelectLeftArrow(false, false)).toBe(false)
})
