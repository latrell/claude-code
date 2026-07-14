/**
 * Domestic (China) LLM provider presets with URLs, pricing, and model data.
 * All providers are OpenAI-compatible — just swap baseURL + apiKey.
 */

export type ProviderModel = {
  id: string
  label: string
  inputPricePerMTok: number
  outputPricePerMTok: number
  contextWindow: string
  free?: boolean
  tags?: string[]
  deprecated?: string
}

export type CodingPlanTier = {
  id: string
  label: string
  price: string
  credits: string
  description: string
}

export type ProviderPreset = {
  id: string
  label: string
  description: string
  icon: string
  baseURL: string
  apiKeyPage: string
  modelsPage: string
  freeTier: string
  keyFormat: string
  codingPlan?: {
    baseURL: string
    keyFormat: string
    purchasePage: string
    tiers: CodingPlanTier[]
  }
  models: ProviderModel[]
}

export const CHINA_LLM_PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'V4 Flash / Pro，1M 上下文，支持 High / Max 思考',
    icon: '\u{1F525}',
    baseURL: 'https://api.deepseek.com',
    apiKeyPage: 'https://platform.deepseek.com/api_keys',
    modelsPage: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
    freeTier: '按量计费，具体优惠以控制台为准',
    keyFormat: 'sk-...',
    models: [
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        inputPricePerMTok: 3,
        outputPricePerMTok: 6,
        contextWindow: '1M',
        tags: ['推荐', '代码能力强'],
      },
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        inputPricePerMTok: 1,
        outputPricePerMTok: 2,
        contextWindow: '1M',
        tags: ['快速'],
      },
    ],
  },
  {
    id: 'zhipu',
    label: 'Zhipu GLM',
    description: 'GLM 5.2、1M 上下文、编程套餐、免费模型',
    icon: '\u{1F9E0}',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyPage: 'https://open.bigmodel.cn/user/apiKeys',
    modelsPage: 'https://docs.bigmodel.cn/cn/guide/start/model-overview',
    freeTier: 'GLM-4.7-Flash / GLM-Z1-Flash 永久免费',
    keyFormat: '{id}.{secret}',
    codingPlan: {
      baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      keyFormat: '{id}.{secret}',
      purchasePage: 'https://bigmodel.cn/claude-code',
      tiers: [
        {
          id: 'lite',
          label: 'Lite',
          price: '¥72/月（$30/季度）',
          credits: '约 400 次提示/周',
          description: 'GLM-5.1/5-Turbo/4.7/4.5-Air，MCP 工具',
        },
        {
          id: 'pro',
          label: 'Pro',
          price: '¥216/月（$90/季度）',
          credits: '约 2000 次提示/周',
          description: 'Lite + GLM-5，5 倍额度',
        },
        {
          id: 'max',
          label: 'Max',
          price: '¥576/月（$240/季度）',
          credits: '约 8000 次提示/周',
          description: '4 倍 Pro 额度，适合重度使用',
        },
      ],
    },
    models: [
      {
        id: 'glm-5.2',
        label: 'GLM 5.2',
        inputPricePerMTok: 8,
        outputPricePerMTok: 28,
        contextWindow: '1M',
        tags: ['推荐', '旗舰'],
      },
      {
        id: 'glm-5.1',
        label: 'GLM 5.1',
        inputPricePerMTok: 6,
        outputPricePerMTok: 24,
        contextWindow: '200K',
        tags: ['≤32K 价格', '阶梯计费'],
      },
      {
        id: 'glm-4.7',
        label: 'GLM 4.7',
        inputPricePerMTok: 2,
        outputPricePerMTok: 8,
        contextWindow: '200K',
        tags: ['短上下文价格', '阶梯计费'],
      },
      {
        id: 'glm-4.7-flash',
        label: 'GLM 4.7 Flash',
        inputPricePerMTok: 0,
        outputPricePerMTok: 0,
        contextWindow: '200K',
        free: true,
        tags: ['永久免费'],
      },
    ],
  },
  {
    id: 'qwen',
    label: 'Tongyi Qianwen',
    description: '阿里云、编程套餐、90 天免费试用',
    icon: '☁️',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyPage: 'https://bailian.console.aliyun.com',
    modelsPage: 'https://help.aliyun.com/zh/model-studio/text-generation-model',
    freeTier: '开通后所有模型享 90 天免费试用',
    keyFormat: 'sk-...',
    codingPlan: {
      baseURL: 'https://coding.dashscope.aliyuncs.com/v1',
      keyFormat: 'sk-sp-...',
      purchasePage: 'https://bailian.console.aliyun.com',
      tiers: [
        {
          id: 'pro',
          label: 'Pro',
          price: '¥200/月',
          credits: '包含 Qwen/GLM/Kimi/MiniMax 模型',
          description: '入门套餐（Lite 已于 2026/03 下线）',
        },
      ],
    },
    models: [
      {
        id: 'qwen3.7-max',
        label: 'Qwen3.7 Max',
        inputPricePerMTok: 12,
        outputPricePerMTok: 36,
        contextWindow: '1M',
        tags: ['旗舰'],
      },
      {
        id: 'qwen3.7-plus',
        label: 'Qwen3.7 Plus',
        inputPricePerMTok: 2,
        outputPricePerMTok: 8,
        contextWindow: '1M',
        tags: ['推荐', '高性价比', '≤256K 价格', '阶梯计费'],
      },
      {
        id: 'qwen3.6-flash',
        label: 'Qwen3.6 Flash',
        inputPricePerMTok: 1.2,
        outputPricePerMTok: 7.2,
        contextWindow: '1M',
        tags: ['快速', '≤256K 价格', '阶梯计费'],
      },
    ],
  },
  {
    id: 'mimo',
    label: 'MiMo Xiaomi',
    description: '1M 上下文、128K 输出、Token 套餐、开源',
    icon: '\u{1F4F1}',
    baseURL: 'https://api.xiaomimimo.com/v1',
    apiKeyPage: 'https://platform.xiaomimimo.com/api-keys',
    modelsPage: 'https://platform.xiaomimimo.com/models',
    freeTier: '新用户赠送 Credits，具体额度以控制台为准',
    keyFormat: 'sk-...',
    codingPlan: {
      baseURL: 'https://token-plan-cn.xiaomimimo.com/v1',
      keyFormat: 'tp-...',
      purchasePage: 'https://platform.xiaomimimo.com/token-plan',
      tiers: [
        {
          id: 'lite',
          label: 'Lite',
          price: '¥39/月（$6/月）',
          credits: '41 亿 Credits/月',
          description: '轻量使用，包含所有 MiMo 模型',
        },
        {
          id: 'standard',
          label: 'Standard',
          price: '¥99/月（$16/月）',
          credits: '110 亿 Credits/月',
          description: '2.7 倍 Lite，适合日常编码',
        },
        {
          id: 'pro',
          label: 'Pro',
          price: '¥329/月（$50/月）',
          credits: '380 亿 Credits/月',
          description: '9 倍 Lite，适合重度复杂项目',
        },
        {
          id: 'max',
          label: 'Max',
          price: '¥659/月（$100/月）',
          credits: '820 亿 Credits/月',
          description: '20 倍 Lite，适合团队级使用',
        },
      ],
    },
    models: [
      {
        id: 'mimo-v2.5-pro',
        label: 'MiMo V2.5 Pro',
        inputPricePerMTok: 3,
        outputPricePerMTok: 6,
        contextWindow: '1M',
        tags: ['推荐', '旗舰'],
      },
      {
        id: 'mimo-v2.5',
        label: 'MiMo V2.5',
        inputPricePerMTok: 1,
        outputPricePerMTok: 2,
        contextWindow: '1M',
        tags: ['多模态'],
      },
      {
        id: 'mimo-v2-flash',
        label: 'MiMo V2 Flash',
        inputPricePerMTok: 0.7,
        outputPricePerMTok: 2.1,
        contextWindow: '256K',
        tags: ['快速'],
        deprecated: '2026-06-30 已下线，请迁移到 MiMo V2.5',
      },
    ],
  },
]

export function findChinaProviderById(id: string): ProviderPreset | undefined {
  return CHINA_LLM_PROVIDERS.find(p => p.id === id)
}

export function resolveChinaProviderBaseURL(
  providerId: string,
  mode: 'api' | 'coding-plan',
): string {
  const provider = findChinaProviderById(providerId)
  if (!provider) return ''
  if (mode === 'coding-plan' && provider.codingPlan) {
    return provider.codingPlan.baseURL
  }
  return provider.baseURL
}
