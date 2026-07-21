import { test } from 'bun:test'

test('waits forever until the wrapper kills this process', async () => {
  console.log('stdout-before-timeout')
  console.error('stderr-before-timeout')
  await new Promise<void>(() => {})
})
