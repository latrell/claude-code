import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import {
  getModelContextWindowForConnection,
  parseContextWindowInput,
  recordAutoDetectedContextWindows,
} from '../../services/connections/contextWindows.js';
import {
  fetchRemoteModelsForConnection,
  pickerModelsForConnection,
  supportsRemoteModelList,
  type RemoteModel,
} from '../../services/connections/modelCatalog.js';
import { withContextWindow, withPinnedModel } from '../../services/connections/profile.js';
import { generateConnectionId, listConnections, upsertConnection } from '../../services/connections/store.js';
import type { Connection, ConnectionKind, TierModels } from '../../services/connections/types.js';
import { saveCurrentOAuthAccountToSlot } from '../../services/connections/oauthAccounts.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { useAppState } from '../../state/AppState.js';
import {
  CHINA_LLM_PROVIDERS,
  resolveChinaProviderBaseURL,
  type ProviderPreset,
} from '../../utils/chinaLlmProviders.js';
import { getGlobalConfig } from '../../utils/config.js';
import { t, tf } from '../../i18n/t.js';
import { ConsoleOAuthFlow } from '../ConsoleOAuthFlow.js';
import { ChatGPTDeviceLogin } from './ChatGPTDeviceLogin.js';
import { ConnectionSelect } from './ConnectionSelect.js';
import { CursorDeviceLogin } from './CursorDeviceLogin.js';
import { ConnectionForm, type ConnectionFormField } from './ConnectionForm.js';
import { connectionOAuthBackTarget } from './navigation.js';
import { ThinkingEffortPicker } from './ThinkingEffortPicker.js';

type WizardStep =
  | { step: 'kind' }
  | { step: 'preset-mode'; preset: ProviderPreset }
  | {
      step: 'form';
      kind: Exclude<ConnectionKind, 'anthropic-oauth' | 'chatgpt-oauth'>;
      preset?: ProviderPreset;
      presetMode?: 'api' | 'coding-plan';
      back: WizardStep;
    }
  | { step: 'claude-oauth' }
  | { step: 'chatgpt-oauth'; scope: string }
  | { step: 'cursor-mode' }
  | { step: 'cursor-oauth'; scope: string }
  /**
   * Profile steps run between credential entry and finishCreate: pin a model,
   * pick a thinking effort (skipped for Cursor — effort is encoded in the
   * model id) and set a context window (skipped for OAuth kinds with
   * provider-known windows). `back` is the pre-profile step Esc returns to.
   */
  | { step: 'profile-model'; draft: Connection; back: WizardStep }
  | { step: 'profile-effort'; draft: Connection; back: WizardStep }
  | { step: 'profile-context'; draft: Connection; back: WizardStep }
  | { step: 'error'; message: string; back: WizardStep };

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

/** Kinds where a context window entry is meaningful (provider-unknown). */
function hasContextStep(kind: ConnectionKind): boolean {
  return kind !== 'anthropic-oauth' && kind !== 'chatgpt-oauth';
}

export function AddConnectionWizard({ onCreated, onCancel }: Props): React.ReactNode {
  const appStateEffort = useAppState(state => state.effortValue);
  const [step, setStep] = useState<WizardStep>({ step: 'kind' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  // Holds the "Custom model…" text field value so the step only advances on
  // Enter (Select's onChange with '__custom__'), not on every keystroke.
  const [customModelInput, setCustomModelInput] = useState('');

  const oauthStep =
    step.step === 'claude-oauth' || step.step === 'chatgpt-oauth' || step.step === 'cursor-oauth' ? step.step : null;
  useKeybinding(
    'confirm:no',
    () => {
      if (!oauthStep) return;
      setStep({ step: connectionOAuthBackTarget(oauthStep) });
    },
    {
      context: 'Confirmation',
      isActive: oauthStep !== null,
    },
  );

  // Fetch the live model list when entering the profile-model step. The
  // draft is not persisted yet, so this uses the pure fetch — detected
  // context windows are recorded onto the connection in finishCreate.
  useEffect(() => {
    setCustomModelInput('');
    if (step.step !== 'profile-model') return;
    const draft = step.draft;
    if (!supportsRemoteModelList(draft.kind)) return;
    let cancelled = false;
    void fetchRemoteModelsForConnection(draft).then(models => {
      if (!cancelled) setRemoteModels(models);
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const finishCreate = useCallback(
    (connection: Connection) => {
      try {
        upsertConnection(connection);
        if (remoteModels.some(m => m.contextLength !== undefined)) {
          recordAutoDetectedContextWindows(connection.id, remoteModels);
        }
        onCreated(connection);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
    [onCreated, remoteModels],
  );

  /** Enter the profile steps for a freshly built draft connection. */
  const startProfile = useCallback((draft: Connection, back: WizardStep) => {
    setSubmitError(null);
    setStep({ step: 'profile-model', draft, back });
  }, []);

  const afterModelStep = useCallback((draft: Connection, back: WizardStep) => {
    if (draft.kind === 'cursor') {
      // Cursor encodes effort in the model id — skip the effort step.
      setStep({ step: 'profile-context', draft, back });
      return;
    }
    setStep({ step: 'profile-effort', draft, back });
  }, []);

  const afterEffortStep = useCallback(
    (draft: Connection, back: WizardStep) => {
      if (hasContextStep(draft.kind)) {
        setStep({ step: 'profile-context', draft, back });
        return;
      }
      finishCreate(draft);
    },
    [finishCreate],
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
        back: { step: 'kind' },
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
    startProfile(connection, { step: 'kind' });
  }, [startProfile]);

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
          description: t('Use models via the Cursor backend (browser sign-in, token, or IDE session)'),
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
      ];
      return (
        <Box key="step-kind" flexDirection="column" gap={1}>
          <Text bold>{t('Add connection')}</Text>
          <Text dimColor>{t('Pick a provider preset or connection type')}</Text>
          <ConnectionSelect
            options={options}
            visibleOptionCount={10}
            onBack={onCancel}
            onChange={choice => {
              setSubmitError(null);
              if (choice.startsWith('preset:')) {
                const preset = CHINA_LLM_PROVIDERS.find(p => p.id === choice.slice('preset:'.length));
                if (!preset) return;
                if (preset.codingPlan) {
                  setStep({ step: 'preset-mode', preset });
                } else {
                  setStep({
                    step: 'form',
                    kind: 'openai-compat',
                    preset,
                    presetMode: 'api',
                    back: { step: 'kind' },
                  });
                }
                return;
              }
              if (choice === 'custom:cursor') {
                setStep({ step: 'cursor-mode' });
                return;
              }
              const customKind = CUSTOM_KIND_CHOICES[choice];
              if (customKind) {
                setStep({ step: 'form', kind: customKind, back: { step: 'kind' } });
                return;
              }
              if (choice === 'claude-oauth') {
                setStep({ step: 'claude-oauth' });
              } else if (choice === 'chatgpt-oauth') {
                setStep({ step: 'chatgpt-oauth', scope: generateConnectionId('chatgpt') });
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
          <ConnectionSelect
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
            ]}
            onBack={() => setStep({ step: 'kind' })}
            onChange={value => {
              setStep({
                step: 'form',
                kind: 'openai-compat',
                preset,
                presetMode: value === 'coding-plan' ? 'coding-plan' : 'api',
                back: { step: 'preset-mode', preset },
              });
            }}
          />
        </Box>
      );
    }

    case 'form': {
      const { kind, preset, presetMode, back } = step;
      const isCursor = kind === 'cursor';
      const presetBaseUrl = preset ? resolveChinaProviderBaseURL(preset.id, presetMode ?? 'api') : undefined;
      const keyFormat =
        preset && presetMode === 'coding-plan' ? (preset.codingPlan?.keyFormat ?? preset.keyFormat) : preset?.keyFormat;

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
          onCancel={() => setStep(back)}
          onSubmit={values => {
            const label = values['label'] || preset?.label || kind;
            const tiers = preset ? presetTierModels(preset) : undefined;
            const connection: Connection = {
              id: generateConnectionId(label),
              label,
              kind,
              baseUrl: values['baseUrl'] || presetBaseUrl || undefined,
              apiKey: values['apiKey'] || undefined,
              ...(values['machineId'] && { machineId: values['machineId'] }),
              ...(tiers && { tierModels: tiers }),
              ...(preset && {
                presetId: preset.id,
                models: preset.models.filter(m => !m.deprecated).map(m => m.id),
              }),
              createdAt: new Date().toISOString(),
            };
            startProfile(connection, step);
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
          <Text dimColor>{`Esc ${t('go back')}`}</Text>
        </Box>
      );

    case 'cursor-mode':
      return (
        <Box key="step-cursor-mode" flexDirection="column" gap={1}>
          <Text bold>{t('Connect Cursor')}</Text>
          <Text dimColor>{t('How do you want to sign in?')}</Text>
          <ConnectionSelect
            options={[
              {
                label: t('Sign in with browser (OAuth)'),
                value: 'oauth',
                description: t('Opens cursor.com to authorize — no token to copy'),
              },
              {
                label: t('Paste token / use signed-in IDE'),
                value: 'manual',
                description: t('Enter a session token + machine id, or reuse the Cursor IDE'),
              },
            ]}
            onBack={() => setStep({ step: 'kind' })}
            onChange={value => {
              if (value === 'oauth') {
                setStep({ step: 'cursor-oauth', scope: generateConnectionId('cursor') });
              } else if (value === 'manual') {
                setStep({ step: 'form', kind: 'cursor', back: { step: 'cursor-mode' } });
              }
            }}
          />
        </Box>
      );

    case 'cursor-oauth':
      return (
        <Box key="step-cursor-oauth" flexDirection="column" gap={1}>
          <CursorDeviceLogin
            scope={step.scope}
            onSuccess={() => {
              const existing = findExisting('cursor', c => c.credentialRef === step.scope);
              const label = t('Cursor Account');
              const connection: Connection = existing ?? {
                id: step.scope,
                label,
                kind: 'cursor',
                credentialRef: step.scope,
                createdAt: new Date().toISOString(),
              };
              startProfile(connection, { step: 'cursor-mode' });
            }}
            onError={message => setStep({ step: 'error', message, back: { step: 'cursor-mode' } })}
          />
          <Text dimColor>{`Esc ${t('go back')}`}</Text>
        </Box>
      );

    case 'chatgpt-oauth':
      return (
        <Box key="step-chatgpt-oauth" flexDirection="column" gap={1}>
          <ChatGPTDeviceLogin
            scope={step.scope}
            onSuccess={() => {
              const existing = findExisting('chatgpt-oauth', c => c.credentialRef === step.scope);
              const label = t('ChatGPT Subscription');
              const connection: Connection = existing ?? {
                id: step.scope,
                label,
                kind: 'chatgpt-oauth',
                credentialRef: step.scope,
                createdAt: new Date().toISOString(),
              };
              startProfile(connection, { step: 'kind' });
            }}
            onError={message => setStep({ step: 'error', message, back: { step: 'kind' } })}
          />
          <Text dimColor>{`Esc ${t('go back')}`}</Text>
        </Box>
      );

    case 'profile-model': {
      const { draft, back } = step;
      const models = pickerModelsForConnection(draft, remoteModels);
      type PickValue = string;
      const options = [
        ...models.map(model => ({
          label: model.label,
          value: (model.value ?? '__default__') as PickValue,
          description: model.description,
        })),
        {
          label: t('Custom model…'),
          value: '__custom__' as PickValue,
          type: 'input' as const,
          placeholder: t('type a model id, Enter to confirm'),
          onChange: setCustomModelInput,
        },
      ];
      return (
        <Box key="step-profile-model" flexDirection="column" gap={1}>
          <Text bold>{tf('Model — {label}', { label: draft.label })}</Text>
          <Text dimColor>{t('Pick the model this connection is pinned to (change later via /connect or /model)')}</Text>
          <ConnectionSelect
            options={options}
            visibleOptionCount={10}
            onBack={() => setStep(back)}
            onChange={value => {
              if (value === '__custom__') {
                const trimmed = customModelInput.trim();
                if (!trimmed) return;
                afterModelStep(withPinnedModel(draft, trimmed), back);
                return;
              }
              if (value === '__default__') {
                afterModelStep(withPinnedModel(draft, undefined), back);
                return;
              }
              afterModelStep(withPinnedModel(draft, value), back);
            }}
          />
        </Box>
      );
    }

    case 'profile-effort': {
      const { draft, back } = step;
      return (
        <Box key="step-profile-effort" flexDirection="column" gap={1}>
          <Text bold>{tf('Thinking effort — {label}', { label: draft.label })}</Text>
          <Text dimColor>
            {t('Configured value → actual request value (environment and /effort overrides take priority)')}
          </Text>
          <ThinkingEffortPicker
            connection={draft}
            appStateEffort={appStateEffort}
            onCancel={() => setStep({ step: 'profile-model', draft, back })}
            onChange={next => afterEffortStep(next, back)}
          />
        </Box>
      );
    }

    case 'profile-context': {
      const { draft, back } = step;
      const detected =
        draft.contextWindow ??
        (draft.model
          ? (remoteModels.find(m => m.id === draft.model)?.contextLength ??
            getModelContextWindowForConnection(draft, draft.model)?.tokens)
          : undefined);
      const backStep: WizardStep =
        draft.kind === 'cursor' ? { step: 'profile-model', draft, back } : { step: 'profile-effort', draft, back };
      return (
        <ConnectionForm
          key="step-profile-context"
          title={tf('Context window — {label}', { label: draft.label })}
          subtitle={t(
            'Tokens the model can hold — sizes auto-compact and the context display (leave empty to skip; 200K assumed)',
          )}
          fields={[
            {
              key: 'contextWindow',
              label: t('Context window'),
              initialValue: detected !== undefined ? String(detected) : '',
              placeholder: t('e.g. 128K or 1M — leave empty to skip'),
            },
          ]}
          submitError={submitError}
          onCancel={() => {
            setSubmitError(null);
            setStep(backStep);
          }}
          onSubmit={values => {
            const raw = (values['contextWindow'] ?? '').trim();
            if (!raw) {
              setSubmitError(null);
              finishCreate(withContextWindow(draft, undefined));
              return;
            }
            const tokens = parseContextWindowInput(raw);
            if (tokens === undefined) {
              setSubmitError(t('Invalid context window — use a token count like 200000, 128K or 1M'));
              return;
            }
            setSubmitError(null);
            finishCreate(withContextWindow(draft, tokens));
          }}
        />
      );
    }

    case 'error':
      return (
        <Box key="step-error" flexDirection="column" gap={1}>
          <Text color="error">{step.message}</Text>
          <ConnectionSelect options={[]} onBack={() => setStep(step.back)} />
        </Box>
      );

    default: {
      const _exhaustive: never = step;
      void _exhaustive;
      return null;
    }
  }
}
