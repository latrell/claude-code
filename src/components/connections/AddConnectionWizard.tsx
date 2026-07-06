import React, { useCallback, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { generateConnectionId, listConnections, upsertConnection } from '../../services/connections/store.js';
import type { Connection, ConnectionKind, TierModels } from '../../services/connections/types.js';
import { saveCurrentOAuthAccountToSlot } from '../../services/connections/oauthAccounts.js';
import {
  CHINA_LLM_PROVIDERS,
  resolveChinaProviderBaseURL,
  type ProviderPreset,
} from '../../utils/chinaLlmProviders.js';
import { getGlobalConfig } from '../../utils/config.js';
import { t, tf } from '../../i18n/t.js';
import { ConsoleOAuthFlow } from '../ConsoleOAuthFlow.js';
import { Select } from '../CustomSelect/select.js';
import { ChatGPTDeviceLogin } from './ChatGPTDeviceLogin.js';
import { ConnectionForm, type ConnectionFormField } from './ConnectionForm.js';

type WizardStep =
  | { step: 'kind' }
  | { step: 'preset-mode'; preset: ProviderPreset }
  | {
      step: 'form';
      kind: Exclude<ConnectionKind, 'anthropic-oauth' | 'chatgpt-oauth'>;
      preset?: ProviderPreset;
      presetMode?: 'api' | 'coding-plan';
    }
  | { step: 'claude-oauth' }
  | { step: 'chatgpt-oauth'; scope: string }
  | { step: 'error'; message: string };

type Props = {
  onCreated: (connection: Connection) => void;
  onCancel: () => void;
};

/**
 * Select option values must be plain strings — object values are recreated
 * with new identities on each render and break Select's focus tracking
 * (see ConnectionsPanel). Custom-endpoint option ids map to their kind here.
 */
const CUSTOM_KIND_CHOICES: Record<string, 'openai-compat' | 'anthropic-api' | 'gemini' | 'grok' | 'cursor'> = {
  'custom:openai-compat': 'openai-compat',
  'custom:anthropic-api': 'anthropic-api',
  'custom:gemini': 'gemini',
  'custom:grok': 'grok',
  'custom:cursor': 'cursor',
};

/** Pick tier defaults from a preset catalog by tag heuristics. */
function presetTierModels(preset: ProviderPreset): TierModels | undefined {
  const models = preset.models.filter(m => !m.deprecated);
  if (models.length === 0) return undefined;
  const byTag = (tag: string) => models.find(m => m.tags?.includes(tag));
  const sonnet = byTag('推荐') ?? models[0];
  const opus = byTag('旗舰') ?? sonnet;
  const haiku = byTag('快速') ?? byTag('永久免费') ?? models[models.length - 1];
  const tiers: TierModels = {};
  if (haiku) tiers.haiku = haiku.id;
  if (sonnet) tiers.sonnet = sonnet.id;
  if (opus) tiers.opus = opus.id;
  return Object.keys(tiers).length > 0 ? tiers : undefined;
}

function findExisting(kind: ConnectionKind, match: (c: Connection) => boolean): Connection | undefined {
  return listConnections().find(c => c.kind === kind && match(c));
}

export function AddConnectionWizard({ onCreated, onCancel }: Props): React.ReactNode {
  const [step, setStep] = useState<WizardStep>({ step: 'kind' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const finishCreate = useCallback(
    (connection: Connection) => {
      try {
        upsertConnection(connection);
        onCreated(connection);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
    [onCreated],
  );

  const handleClaudeOAuthDone = useCallback(() => {
    // ConsoleOAuthFlow finished a claude.ai login: the active credential and
    // account slot are already installed. Register (or refresh) a connection
    // pointing at the account slot.
    const account = getGlobalConfig().oauthAccount;
    if (!account?.accountUuid) {
      setStep({
        step: 'error',
        message: t('Login finished but no account information was stored.'),
      });
      return;
    }
    saveCurrentOAuthAccountToSlot();
    const existing = findExisting('anthropic-oauth', c => c.credentialRef === account.accountUuid);
    const label = account.emailAddress || t('Claude Account');
    const connection: Connection = existing
      ? { ...existing, label, accountEmail: account.emailAddress }
      : {
          id: generateConnectionId(label),
          label,
          kind: 'anthropic-oauth',
          credentialRef: account.accountUuid,
          accountEmail: account.emailAddress,
          createdAt: new Date().toISOString(),
        };
    finishCreate(connection);
  }, [finishCreate]);

  switch (step.step) {
    case 'kind': {
      const options: Array<{ label: string; value: string; description?: string }> = [
        ...CHINA_LLM_PROVIDERS.map(preset => ({
          label: `${preset.icon} ${preset.label}`,
          value: `preset:${preset.id}`,
          description: preset.description,
        })),
        {
          label: t('OpenAI Compatible (custom endpoint)'),
          value: 'custom:openai-compat',
          description: t('Any OpenAI Chat Completions endpoint (Ollama, vLLM, …)'),
        },
        {
          label: t('Anthropic Compatible (custom endpoint)'),
          value: 'custom:anthropic-api',
          description: t('Anthropic Messages API gateway with base URL + auth token'),
        },
        {
          label: t('Gemini API'),
          value: 'custom:gemini',
          description: t('Google Gemini Generate Content API'),
        },
        {
          label: t('Grok (xAI)'),
          value: 'custom:grok',
          description: t('xAI Grok API (OpenAI compatible)'),
        },
        {
          label: t('Cursor IDE'),
          value: 'custom:cursor',
          description: t('Use models via the Cursor IDE backend (reads your signed-in Cursor session)'),
        },
        {
          label: t('Claude account (OAuth)'),
          value: 'claude-oauth',
          description: t('Sign in with a claude.ai subscription account'),
        },
        {
          label: t('ChatGPT subscription (OAuth)'),
          value: 'chatgpt-oauth',
          description: t('Sign in with a ChatGPT account via device code'),
        },
        { label: t('Back'), value: 'back' },
      ];
      return (
        <Box key="step-kind" flexDirection="column" gap={1}>
          <Text bold>{t('Add connection')}</Text>
          <Text dimColor>{t('Pick a provider preset or connection type')}</Text>
          <Select
            options={options}
            visibleOptionCount={10}
            onCancel={onCancel}
            onChange={choice => {
              setSubmitError(null);
              if (choice.startsWith('preset:')) {
                const preset = CHINA_LLM_PROVIDERS.find(p => p.id === choice.slice('preset:'.length));
                if (!preset) return;
                if (preset.codingPlan) {
                  setStep({ step: 'preset-mode', preset });
                } else {
                  setStep({ step: 'form', kind: 'openai-compat', preset, presetMode: 'api' });
                }
                return;
              }
              const customKind = CUSTOM_KIND_CHOICES[choice];
              if (customKind) {
                setStep({ step: 'form', kind: customKind });
                return;
              }
              if (choice === 'claude-oauth') {
                setStep({ step: 'claude-oauth' });
              } else if (choice === 'chatgpt-oauth') {
                setStep({ step: 'chatgpt-oauth', scope: generateConnectionId('chatgpt') });
              } else if (choice === 'back') {
                onCancel();
              }
            }}
          />
        </Box>
      );
    }

    case 'preset-mode': {
      const preset = step.preset;
      return (
        <Box key="step-preset-mode" flexDirection="column" gap={1}>
          <Text bold>{tf('{provider} access mode', { provider: preset.label })}</Text>
          <Select
            options={[
              {
                label: t('API (pay per token)'),
                value: 'api',
                description: preset.freeTier,
              },
              {
                label: t('Coding plan (subscription)'),
                value: 'coding-plan',
                description: preset.codingPlan?.tiers.map(tier => `${tier.label} ${tier.price}`).join(' · '),
              },
              { label: t('Back'), value: 'back' },
            ]}
            onCancel={() => setStep({ step: 'kind' })}
            onChange={value => {
              if (value === 'back') {
                setStep({ step: 'kind' });
                return;
              }
              setStep({
                step: 'form',
                kind: 'openai-compat',
                preset,
                presetMode: value === 'coding-plan' ? 'coding-plan' : 'api',
              });
            }}
          />
        </Box>
      );
    }

    case 'form': {
      const { kind, preset, presetMode } = step;
      const isCursor = kind === 'cursor';
      const presetBaseUrl = preset ? resolveChinaProviderBaseURL(preset.id, presetMode ?? 'api') : undefined;
      const keyFormat =
        preset && presetMode === 'coding-plan' ? (preset.codingPlan?.keyFormat ?? preset.keyFormat) : preset?.keyFormat;

      const tierFields: ConnectionFormField[] = [
        {
          key: 'haiku',
          label: t('Haiku'),
          placeholder: t('model for fast/background tasks (optional)'),
        },
        {
          key: 'sonnet',
          label: t('Sonnet'),
          required: kind === 'gemini',
          placeholder: t('default model (recommended)'),
        },
        {
          key: 'opus',
          label: t('Opus'),
          placeholder: t('model for complex tasks (optional)'),
        },
      ];

      // Cursor uses a session token + machine id (both optional — falls back to
      // the signed-in Cursor IDE), and needs no base URL.
      const fields: ConnectionFormField[] = isCursor
        ? [
            {
              key: 'label',
              label: t('Name'),
              required: true,
              initialValue: 'Cursor',
              placeholder: t('Display name, e.g. "Cursor work"'),
            },
            {
              key: 'apiKey',
              label: t('Access token'),
              mask: true,
              placeholder: t('optional — leave empty to use the signed-in Cursor IDE'),
            },
            {
              key: 'machineId',
              label: t('Machine ID'),
              placeholder: t('optional — auto-detected from the Cursor IDE'),
            },
            ...tierFields,
          ]
        : [
            {
              key: 'label',
              label: t('Name'),
              required: true,
              initialValue: preset ? preset.label : '',
              placeholder: t('Display name, e.g. "DeepSeek personal"'),
            },
            {
              key: 'baseUrl',
              label: t('Base URL'),
              url: true,
              required: kind === 'openai-compat' || kind === 'anthropic-api',
              initialValue: presetBaseUrl ?? '',
              locked: Boolean(preset),
              placeholder:
                kind === 'gemini'
                  ? t('optional — default Gemini endpoint')
                  : kind === 'grok'
                    ? 'https://api.x.ai/v1'
                    : 'https://api.example.com/v1',
            },
            {
              key: 'apiKey',
              label: t('API Key'),
              mask: true,
              required: true,
              placeholder: keyFormat ?? 'sk-…',
            },
            ...(preset ? [] : tierFields),
          ];

      return (
        <ConnectionForm
          key="step-form"
          title={
            isCursor
              ? t('Connect Cursor IDE')
              : preset
                ? tf('Connect {provider}', { provider: preset.label })
                : t('Connection details')
          }
          subtitle={
            isCursor
              ? t('Sign in to the Cursor IDE first, or paste a session token + machine id.')
              : preset
                ? tf('Get an API key: {url}', {
                    url:
                      presetMode === 'coding-plan'
                        ? (preset.codingPlan?.purchasePage ?? preset.apiKeyPage)
                        : preset.apiKeyPage,
                  })
                : undefined
          }
          fields={fields}
          submitError={submitError}
          onCancel={() => setStep({ step: 'kind' })}
          onSubmit={values => {
            const label = values['label'] || preset?.label || kind;
            const tiers: TierModels = preset
              ? (presetTierModels(preset) ?? {})
              : {
                  ...(values['haiku'] && { haiku: values['haiku'] }),
                  ...(values['sonnet'] && { sonnet: values['sonnet'] }),
                  ...(values['opus'] && { opus: values['opus'] }),
                };
            const connection: Connection = {
              id: generateConnectionId(label),
              label,
              kind,
              baseUrl: values['baseUrl'] || presetBaseUrl || undefined,
              apiKey: values['apiKey'] || undefined,
              ...(values['machineId'] && { machineId: values['machineId'] }),
              ...(Object.keys(tiers).length > 0 && { tierModels: tiers }),
              ...(preset && {
                presetId: preset.id,
                models: preset.models.filter(m => !m.deprecated).map(m => m.id),
              }),
              createdAt: new Date().toISOString(),
            };
            finishCreate(connection);
          }}
        />
      );
    }

    case 'claude-oauth':
      return (
        <Box key="step-claude-oauth" flexDirection="column" gap={1}>
          <Text dimColor>
            {t('Signing in adds this account as a connection and makes it the active Claude account.')}
          </Text>
          <ConsoleOAuthFlow forceLoginMethod="claudeai" onDone={handleClaudeOAuthDone} />
        </Box>
      );

    case 'chatgpt-oauth':
      return (
        <ChatGPTDeviceLogin
          key="step-chatgpt-oauth"
          scope={step.scope}
          onSuccess={() => {
            const existing = findExisting('chatgpt-oauth', c => c.credentialRef === step.scope);
            const label = t('ChatGPT Subscription');
            finishCreate(
              existing ?? {
                id: step.scope,
                label,
                kind: 'chatgpt-oauth',
                credentialRef: step.scope,
                createdAt: new Date().toISOString(),
              },
            );
          }}
          onError={message => setStep({ step: 'error', message })}
        />
      );

    case 'error':
      return (
        <Box key="step-error" flexDirection="column" gap={1}>
          <Text color="error">{step.message}</Text>
          <Select
            options={[
              { label: t('Back'), value: 'back' },
              { label: t('Cancel'), value: 'cancel' },
            ]}
            onCancel={onCancel}
            onChange={value => {
              if (value === 'back') setStep({ step: 'kind' });
              else onCancel();
            }}
          />
        </Box>
      );

    default: {
      const _exhaustive: never = step;
      void _exhaustive;
      return null;
    }
  }
}
