import { describe, expect, test } from 'bun:test'
import { classifyConnectionOrigin } from '../origin.js'
import type { Connection } from '../types.js'

function connection(baseUrl?: string): Pick<Connection, 'kind' | 'baseUrl'> {
  return { kind: 'openai-compat', baseUrl }
}

describe('classifyConnectionOrigin', () => {
  test.each([
    'https://api.deepseek.com',
    'https://API.DEEPSEEK.COM/v1/',
    'https://api.anthropic.com/v1',
    'https://api.openai.com/v1',
    'https://generativelanguage.googleapis.com/v1beta',
    'https://api.x.ai/v1',
    'https://api2.cursor.sh',
    'https://open.bigmodel.cn/api/paas/v4',
    'https://coding.dashscope.aliyuncs.com/v1',
  ])('recognizes official endpoint %s', baseUrl => {
    expect(classifyConnectionOrigin(connection(baseUrl))).toBe('official')
  })

  test('treats a provider default without a custom URL as official', () => {
    expect(classifyConnectionOrigin(connection())).toBe('official')
  })

  test.each([
    'http://localhost:8080/v1',
    'http://127.0.0.1:8080/v1',
    'http://10.0.0.8/v1',
    'http://172.16.0.8/v1',
    'http://172.31.255.254/v1',
    'http://192.168.11.6:8080/v1',
    'http://100.64.0.1/v1',
    'http://[::1]:8080/v1',
    'http://[fd00::1]:8080/v1',
    'http://dgx-spark.local:8080/v1',
    'http://dgx-spark:8080/v1',
  ])('recognizes local or private endpoint %s', baseUrl => {
    expect(classifyConnectionOrigin(connection(baseUrl))).toBe('local')
  })

  test.each([
    'https://openrouter.ai/api/v1',
    'https://api.deepseek.com.evil.example/v1',
    'https://deepseek-proxy.example.com/v1',
    'https://[2606:4700:4700::1111]/v1',
    'not a URL',
  ])('classifies non-official public endpoint %s as third-party', baseUrl => {
    expect(classifyConnectionOrigin(connection(baseUrl))).toBe('third-party')
  })
})
