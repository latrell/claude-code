import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Dialog, Text } from '@anthropic/ink';
import {
  activateConnectionForSession,
  activateConnectionGlobally,
  clearSubagentDefault,
  getSessionAssignment,
} from '../../services/connections/activate.js';
import {
  formatContextWindow,
  getModelContextWindowForConnection,
  parseContextWindowInput,
  setManualContextWindow,
} from '../../services/connections/contextWindows.js';
import { importLegacyConnections } from '../../services/connections/migrate.js';
import {
  fetchAndRecordRemoteModels,
  getStaticModelsForConnection,
  supportsRemoteModelList,
  type CatalogModel,
  type RemoteModel,
} from '../../services/connections/modelCatalog.js';
import { removeOAuthAccountSlot } from '../../services/connections/oauthAccounts.js';
import {
  _invalidateConnectionsCache,
  getDefaultAssignment,
  listConnections,
  removeConnection,
  upsertConnection,
} from '../../services/connections/store.js';
import type { AgentSlot, Connection, ConnectionKind } from '../../services/connections/types.js';
import { removeChatGPTAuth } from '../../services/api/openai/chatgptAuth.js';
import { removeCursorOAuth } from '../../services/api/cursor/cursorOAuth.js';
import { t, tf } from '../../i18n/t.js';
import { Select } from '../CustomSelect/select.js';
import { Spinner } from '../Spinner.js';
import { AddConnectionWizard } from './AddConnectionWizard.js';
import { ConnectionForm, type ConnectionFormField } from './ConnectionForm.js';

export type ActivationScope = 'session' | 'global';

/**
 * Menu option ids for the four activate actions. Select option values must
 * be plain strings: Select keys its navigation state by value identity, and
 * object literals recreated on each render strand the focus on a stale
 * identity (arrow keys stop moving the visible cursor).
 */
const ACTIVATION_MENU_ACTIONS: Record<string, { slot: AgentSlot; scope: ActivationScope }> = {
  'activate:main:session': { slot: 'main', scope: 'session' },
  'activate:main:global': { slot: 'main', scope: 'global' },
  'activate:subagent:session': { slot: 'subagent', scope: 'session' },
  'activate:subagent:global': { slot: 'subagent', scope: 'global' },
};

type View =
  | { mode: 'list' }
  | { mode: 'menu'; connectionId: string }
  | {
      mode: 'model-pick';
      connectionId: string;
      slot: AgentSlot;
      scope: ActivationScope;
    }
  /** Pick which model to configure a context window for (menu entry). */
  | { mode: 'ctx-model-pick'; connectionId: string }
  /**
   * Context window input for one model. `next` carries the pending
   * activation when this step was reached from the model picker;
   * null = editing from the connection menu.
   */
  | {
      mode: 'context-window';
      connectionId: string;
      model: string;
      next: { slot: AgentSlot; scope: ActivationScope } | null;
    }
  | { mode: 'add' }
  | { mode: 'edit'; connectionId: string }
  | { mode: 'confirm-delete'; connectionId: string }
  | { mode: 'busy'; message: string }
  | { mode: 'error'; message: string; back: View };

type Props = {
  onDone: (message?: string) => void;
  /** Applies a main-loop model change to AppState. */
  onMainModelChange: (model: string | null) => void;
  /** Post-activation refresh (authVersion bump, API key revalidation). */
  onAuthChanged: () => void;
};

export function kindDisplayName(kind: ConnectionKind): string {
  switch (kind) {
    case 'anthropic-oauth':
      return t('Claude account');
    case 'anthropic-api':
      return t('Anthropic compatible');
    case 'chatgpt-oauth':
      return t('ChatGPT account');
    case 'openai-compat':
      return t('OpenAI compatible');
    case 'gemini':
      return 'Gemini';
    case 'grok':
      return 'Grok';
    case 'cursor':
      return 'Cursor';
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return String(kind);
    }
  }
}

function connectionBadges(connection: Connection): string[] {
  const badges: string[] = [];
  if (getDefaultAssignment('main')?.connectionId === connection.id) {
    badges.push(t('main default'));
  }
  if (getDefaultAssignment('subagent')?.connectionId === connection.id) {
    badges.push(t('subagent default'));
  }
  if (getSessionAssignment('main')?.connectionId === connection.id) {
    badges.push(t('in use (main)'));
  }
  if (getSessionAssignment('subagent')?.connectionId === connection.id) {
    badges.push(t('in use (subagent)'));
  }
  return badges;
}

function connectionDetail(connection: Connection): string {
  const parts: string[] = [kindDisplayName(connection.kind)];
  if (connection.accountEmail) parts.push(connection.accountEmail);
  else if (connection.baseUrl) parts.push(connection.baseUrl);
  const badges = connectionBadges(connection);
  if (badges.length > 0) parts.push(badges.join(' · '));
  return parts.join(' · ');
}

/**
 * Models offered by the picker for a connection. For key-based third-party
 * kinds without a tier mapping the "Default" entry is dropped — an explicit
 * model id is required for the endpoint to work.
 */
function pickerModels(connection: Connection, remoteModels: RemoteModel[]): CatalogModel[] {
  let models = getStaticModelsForConnection(connection);
  const needsExplicitModel =
    (connection.kind === 'openai-compat' || connection.kind === 'gemini' || connection.kind === 'grok') &&
    !connection.tierModels?.sonnet;
  if (needsExplicitModel) {
    models = models.filter(m => m.value !== null);
  }
  const seen = new Set(models.map(m => m.value ?? ''));
  for (const model of remoteModels) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    models.push({
      value: model.id,
      label: model.id,
      description: model.contextLength !== undefined ? `ctx ${formatContextWindow(model.contextLength)}` : undefined,
    });
  }
  return models;
}

/**
 * Whether picking `model` should route through the context window step:
 * third-party kinds only, and only when no window is known yet (auto,
 * manual or preset). Once configured the picker activates directly.
 */
function needsContextWindowPrompt(connection: Connection, model: string | null): model is string {
  if (!model) return false;
  if (!supportsRemoteModelList(connection.kind)) return false;
  return getModelContextWindowForConnection(connection, model) === undefined;
}

export function ConnectionsPanel({ onDone, onMainModelChange, onAuthChanged }: Props): React.ReactNode {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [refreshTick, setRefreshTick] = useState(0);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Idempotent import of legacy provider/credential config on first open
  useEffect(() => {
    importLegacyConnections();
    setRefreshTick(tick => tick + 1);
  }, []);

  const connections = useMemo(() => {
    void refreshTick;
    return listConnections();
  }, [refreshTick]);

  const refresh = useCallback(() => {
    _invalidateConnectionsCache();
    setRefreshTick(tick => tick + 1);
  }, []);

  // Fetch live model list when entering a model picker view. Detected
  // context windows are recorded onto the connection, so the registry is
  // re-read once the fetch resolves.
  useEffect(() => {
    if (view.mode !== 'model-pick' && view.mode !== 'ctx-model-pick') {
      // Keep the empty-array identity stable — a fresh [] on every view
      // change forces a pointless extra re-render of the active view.
      setRemoteModels(prev => (prev.length === 0 ? prev : []));
      return;
    }
    const connection = listConnections().find(c => c.id === view.connectionId);
    if (!connection) return;
    let cancelled = false;
    void fetchAndRecordRemoteModels(connection).then(models => {
      if (cancelled) return;
      setRemoteModels(models);
      if (models.some(m => m.contextLength !== undefined)) {
        _invalidateConnectionsCache();
        setRefreshTick(tick => tick + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const doActivate = useCallback(
    async (connection: Connection, slot: AgentSlot, scope: ActivationScope, model: string | null) => {
      const previous: View = { mode: 'menu', connectionId: connection.id };
      setView({ mode: 'busy', message: t('Switching…') });
      const result =
        scope === 'global'
          ? await activateConnectionGlobally(connection, slot, model)
          : await activateConnectionForSession(connection, slot, model);
      if (!result.success) {
        setView({
          mode: 'error',
          message: result.error ?? t('Failed to switch connection.'),
          back: previous,
        });
        return;
      }
      if (slot === 'main') {
        onMainModelChange(result.mainLoopModel ?? null);
      }
      onAuthChanged();
      let modelSuffix = '';
      if (model) {
        const fresh = listConnections().find(c => c.id === connection.id) ?? connection;
        const ctx = supportsRemoteModelList(connection.kind)
          ? getModelContextWindowForConnection(fresh, model)
          : undefined;
        modelSuffix = ctx ? ` (${model} · ctx ${formatContextWindow(ctx.tokens)})` : ` (${model})`;
      }
      const message =
        slot === 'main'
          ? scope === 'global'
            ? tf('{label}{model} is now the global default', {
                label: connection.label,
                model: modelSuffix,
              })
            : tf('Using {label}{model} for this session', {
                label: connection.label,
                model: modelSuffix,
              })
          : scope === 'global'
            ? tf('{label}{model} is now the subagent default', {
                label: connection.label,
                model: modelSuffix,
              })
            : tf('Subagents use {label}{model} for this session', {
                label: connection.label,
                model: modelSuffix,
              });
      onDone(message);
    },
    [onDone, onMainModelChange, onAuthChanged],
  );

  const doDelete = useCallback(
    (connection: Connection) => {
      try {
        if (connection.kind === 'anthropic-oauth' && connection.credentialRef) {
          removeOAuthAccountSlot(connection.credentialRef);
        }
        if (connection.kind === 'chatgpt-oauth' && connection.credentialRef && connection.credentialRef !== 'default') {
          void removeChatGPTAuth(connection.credentialRef).catch(() => {});
        }
        if (connection.kind === 'cursor' && connection.credentialRef && connection.credentialRef !== 'default') {
          void removeCursorOAuth(connection.credentialRef).catch(() => {});
        }
        removeConnection(connection.id);
        refresh();
        setView({ mode: 'list' });
      } catch (err) {
        setView({
          mode: 'error',
          message: err instanceof Error ? err.message : String(err),
          back: { mode: 'list' },
        });
      }
    },
    [refresh],
  );

  const inner = (() => {
    switch (view.mode) {
      case 'list': {
        const hasSubagentDefault = getDefaultAssignment('subagent') !== undefined;
        const options: Array<{
          label: string;
          value: string;
          description?: string;
        }> = [
          ...connections.map(connection => ({
            label: connection.label,
            value: `connection:${connection.id}`,
            description: connectionDetail(connection),
          })),
          { label: t('+ Add connection…'), value: 'add' },
          ...(hasSubagentDefault
            ? [
                {
                  label: t('Clear subagent default (inherit main)'),
                  value: 'clear-subagent',
                },
              ]
            : []),
          { label: t('Close'), value: 'close' },
        ];
        return (
          <Box flexDirection="column" gap={1}>
            {connections.length === 0 ? (
              <Text dimColor>{t('No connections yet. Add one to manage providers and accounts.')}</Text>
            ) : null}
            <Select
              options={options}
              visibleOptionCount={12}
              onCancel={() => onDone()}
              onChange={value => {
                if (value.startsWith('connection:')) {
                  setView({
                    mode: 'menu',
                    connectionId: value.slice('connection:'.length),
                  });
                  return;
                }
                if (value === 'add') {
                  setView({ mode: 'add' });
                } else if (value === 'clear-subagent') {
                  clearSubagentDefault();
                  refresh();
                } else if (value === 'close') {
                  onDone();
                }
              }}
            />
          </Box>
        );
      }

      case 'menu': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>{connection.label}</Text>
            <Text dimColor>{connectionDetail(connection)}</Text>
            <Select
              options={[
                {
                  label: t('Use for this session (main agent)'),
                  value: 'activate:main:session',
                },
                {
                  label: t('Set as global default (main agent)'),
                  value: 'activate:main:global',
                },
                {
                  label: t('Use for this session (subagents)'),
                  value: 'activate:subagent:session',
                },
                {
                  label: t('Set as global default (subagents)'),
                  value: 'activate:subagent:global',
                },
                ...(supportsRemoteModelList(connection.kind)
                  ? [
                      {
                        label: t('Model context windows…'),
                        value: 'ctx',
                      },
                    ]
                  : []),
                { label: t('Edit'), value: 'edit' },
                { label: t('Delete'), value: 'delete' },
                { label: t('Back'), value: 'back' },
              ]}
              visibleOptionCount={8}
              onCancel={() => setView({ mode: 'list' })}
              onChange={value => {
                const activation = ACTIVATION_MENU_ACTIONS[value];
                if (activation) {
                  setView({
                    mode: 'model-pick',
                    connectionId: connection.id,
                    slot: activation.slot,
                    scope: activation.scope,
                  });
                  return;
                }
                if (value === 'ctx') {
                  setView({ mode: 'ctx-model-pick', connectionId: connection.id });
                } else if (value === 'edit') {
                  setView({ mode: 'edit', connectionId: connection.id });
                } else if (value === 'delete') {
                  setView({ mode: 'confirm-delete', connectionId: connection.id });
                } else {
                  setView({ mode: 'list' });
                }
              }}
            />
          </Box>
        );
      }

      case 'model-pick': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        const models = pickerModels(connection, remoteModels);
        // Picking a model without a known context window inserts the
        // (skippable) context window step before activating.
        const pickModel = (model: string | null) => {
          if (needsContextWindowPrompt(connection, model)) {
            setView({
              mode: 'context-window',
              connectionId: connection.id,
              model,
              next: { slot: view.slot, scope: view.scope },
            });
            return;
          }
          void doActivate(connection, view.slot, view.scope, model);
        };
        type PickValue = string | null;
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
            onChange: (custom: string) => {
              const trimmed = custom.trim();
              if (!trimmed) return;
              pickModel(trimmed);
            },
          },
          { label: t('Back'), value: '__back__' as PickValue },
        ];
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>{view.slot === 'main' ? t('Pick a model (main agent)') : t('Pick a model (subagents)')}</Text>
            <Text dimColor>{view.scope === 'global' ? t('Persists across sessions') : t('This session only')}</Text>
            <Select
              options={options}
              visibleOptionCount={10}
              onCancel={() => setView({ mode: 'menu', connectionId: connection.id })}
              onChange={value => {
                if (value === '__back__') {
                  setView({ mode: 'menu', connectionId: connection.id });
                  return;
                }
                if (value === '__custom__') return; // handled by input onChange
                pickModel(value === '__default__' ? null : value);
              }}
            />
          </Box>
        );
      }

      case 'ctx-model-pick': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        const models = pickerModels(connection, remoteModels).filter(m => m.value !== null);
        type CtxPickValue = string;
        const options = [
          ...models.map(model => {
            const ctx = getModelContextWindowForConnection(connection, model.value ?? '');
            return {
              label: model.label,
              value: (model.value ?? '') as CtxPickValue,
              description: ctx ? `ctx ${formatContextWindow(ctx.tokens)}` : t('ctx unknown, 200K assumed'),
            };
          }),
          {
            label: t('Custom model…'),
            value: '__custom__' as CtxPickValue,
            type: 'input' as const,
            placeholder: t('type a model id, Enter to confirm'),
            onChange: (custom: string) => {
              const trimmed = custom.trim();
              if (!trimmed) return;
              setView({
                mode: 'context-window',
                connectionId: connection.id,
                model: trimmed,
                next: null,
              });
            },
          },
          { label: t('Back'), value: '__back__' as CtxPickValue },
        ];
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>{t('Model context windows')}</Text>
            <Text dimColor>
              {t('Pick a model to set its context window (used for auto-compact and context display)')}
            </Text>
            <Select
              options={options}
              visibleOptionCount={10}
              onCancel={() => setView({ mode: 'menu', connectionId: connection.id })}
              onChange={value => {
                if (value === '__back__') {
                  setView({ mode: 'menu', connectionId: connection.id });
                  return;
                }
                if (value === '__custom__') return; // handled by input onChange
                setView({
                  mode: 'context-window',
                  connectionId: connection.id,
                  model: value,
                  next: null,
                });
              }}
            />
          </Box>
        );
      }

      case 'context-window': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        const current = getModelContextWindowForConnection(connection, view.model);
        const backView: View = view.next
          ? {
              mode: 'model-pick',
              connectionId: connection.id,
              slot: view.next.slot,
              scope: view.next.scope,
            }
          : { mode: 'ctx-model-pick', connectionId: connection.id };
        const proceed = () => {
          if (view.next) {
            void doActivate(connection, view.next.slot, view.next.scope, view.model);
          } else {
            refresh();
            setView({ mode: 'ctx-model-pick', connectionId: connection.id });
          }
        };
        return (
          <ConnectionForm
            title={tf('Context window — {model}', { model: view.model })}
            subtitle={
              current
                ? tf('Current: {value} tokens ({source})', {
                    value: String(current.tokens),
                    source:
                      current.source === 'manual'
                        ? t('set manually')
                        : current.source === 'preset'
                          ? t('from preset')
                          : t('auto-detected'),
                  })
                : t('Not reported by the provider — enter it to size auto-compact correctly (200K assumed otherwise)')
            }
            fields={[
              {
                key: 'contextWindow',
                label: t('Context window'),
                initialValue: current?.source === 'manual' ? String(current.tokens) : '',
                placeholder: view.next
                  ? t('e.g. 128K or 1M — leave empty to skip')
                  : t('e.g. 128K or 1M — leave empty to clear the manual value'),
              },
            ]}
            submitError={submitError}
            onCancel={() => {
              setSubmitError(null);
              setView(backView);
            }}
            onSubmit={values => {
              const raw = (values['contextWindow'] ?? '').trim();
              if (!raw) {
                setSubmitError(null);
                if (!view.next) {
                  // Menu edit path: empty clears the manual override
                  setManualContextWindow(connection.id, view.model, undefined);
                }
                proceed();
                return;
              }
              const tokens = parseContextWindowInput(raw);
              if (tokens === undefined) {
                setSubmitError(t('Invalid context window — use a token count like 200000, 128K or 1M'));
                return;
              }
              setSubmitError(null);
              setManualContextWindow(connection.id, view.model, tokens);
              proceed();
            }}
          />
        );
      }

      case 'add':
        return (
          <AddConnectionWizard
            onCancel={() => setView({ mode: 'list' })}
            onCreated={connection => {
              refresh();
              setView({ mode: 'menu', connectionId: connection.id });
            }}
          />
        );

      case 'edit': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }

        const isCursorManual = connection.kind === 'cursor' && !connection.credentialRef;
        const isApiKey =
          connection.kind === 'openai-compat' ||
          connection.kind === 'anthropic-api' ||
          connection.kind === 'gemini' ||
          connection.kind === 'grok' ||
          isCursorManual;
        const hasPreset = Boolean(connection.presetId);

        const fields: ConnectionFormField[] = [
          {
            key: 'label',
            label: t('Name'),
            required: true,
            initialValue: connection.label,
          },
        ];

        if (connection.kind === 'anthropic-oauth' && connection.accountEmail) {
          fields.push({
            key: 'accountEmail',
            label: t('Email'),
            initialValue: connection.accountEmail,
            locked: true,
          });
        }

        if (isApiKey) {
          if (!isCursorManual) {
            fields.push({
              key: 'baseUrl',
              label: t('Base URL'),
              url: true,
              required: connection.kind === 'openai-compat' || connection.kind === 'anthropic-api',
              initialValue: connection.baseUrl ?? '',
              locked: hasPreset,
              placeholder:
                connection.kind === 'gemini'
                  ? t('optional — default Gemini endpoint')
                  : connection.kind === 'grok'
                    ? 'https://api.x.ai/v1'
                    : 'https://api.example.com/v1',
            });
          }
          fields.push({
            key: 'apiKey',
            label: isCursorManual ? t('Access token') : t('API Key'),
            mask: true,
            required: !isCursorManual,
            initialValue: connection.apiKey ?? '',
            placeholder: isCursorManual ? undefined : 'sk-…',
          });
          if (isCursorManual) {
            fields.push({
              key: 'machineId',
              label: t('Machine ID'),
              initialValue: connection.machineId ?? '',
              placeholder: t('optional — auto-detected from the Cursor IDE'),
            });
          }
          if (!hasPreset || isCursorManual) {
            fields.push(
              {
                key: 'haiku',
                label: t('Haiku'),
                initialValue: connection.tierModels?.haiku ?? '',
                placeholder: t('model for fast/background tasks (optional)'),
              },
              {
                key: 'sonnet',
                label: t('Sonnet'),
                initialValue: connection.tierModels?.sonnet ?? '',
                placeholder: t('default model (recommended)'),
              },
              {
                key: 'opus',
                label: t('Opus'),
                initialValue: connection.tierModels?.opus ?? '',
                placeholder: t('model for complex tasks (optional)'),
              },
            );
          }
        }

        return (
          <ConnectionForm
            title={t('Edit connection')}
            fields={fields}
            submitError={submitError}
            onCancel={() => {
              setSubmitError(null);
              setView({ mode: 'menu', connectionId: connection.id });
            }}
            onSubmit={values => {
              const updated: Connection = {
                ...connection,
                label: values['label'] || connection.label,
              };

              if (isApiKey) {
                if (!isCursorManual && !hasPreset) {
                  updated.baseUrl = values['baseUrl'] || undefined;
                }
                updated.apiKey = values['apiKey'] || undefined;
                if (isCursorManual) {
                  updated.machineId = values['machineId'] || undefined;
                }
                if (!hasPreset || isCursorManual) {
                  const haiku = values['haiku']?.trim();
                  const sonnet = values['sonnet']?.trim();
                  const opus = values['opus']?.trim();
                  if (haiku || sonnet || opus) {
                    updated.tierModels = {
                      ...(haiku && { haiku }),
                      ...(sonnet && { sonnet }),
                      ...(opus && { opus }),
                    };
                  } else {
                    delete updated.tierModels;
                  }
                }
              }

              upsertConnection(updated);
              refresh();
              setSubmitError(null);
              setView({ mode: 'menu', connectionId: connection.id });
            }}
          />
        );
      }

      case 'confirm-delete': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        return (
          <Box flexDirection="column" gap={1}>
            <Text>
              {tf('Delete connection "{label}"? Stored credentials for it will be removed.', {
                label: connection.label,
              })}
            </Text>
            <Select
              options={[
                { label: t('Cancel'), value: 'cancel' },
                { label: t('Delete'), value: 'delete' },
              ]}
              onCancel={() => setView({ mode: 'menu', connectionId: connection.id })}
              onChange={value => {
                if (value === 'delete') {
                  doDelete(connection);
                } else {
                  setView({ mode: 'menu', connectionId: connection.id });
                }
              }}
            />
          </Box>
        );
      }

      case 'busy':
        return (
          <Box>
            <Spinner />
            <Text>{view.message}</Text>
          </Box>
        );

      case 'error':
        return (
          <Box flexDirection="column" gap={1}>
            <Text color="error">{view.message}</Text>
            <Select
              options={[{ label: t('Back'), value: 'back' }]}
              onCancel={() => setView(view.back)}
              onChange={() => setView(view.back)}
            />
          </Box>
        );

      default: {
        const _exhaustive: never = view;
        void _exhaustive;
        return null;
      }
    }
  })();

  // Remount the active view's subtree whenever the view changes. Adjacent
  // views can share the same JSX shape (menu → model-pick is Box[Text, Text,
  // Select]), so without a key React reuses the mounted Select — its overlay
  // unmount hook (which invalidates the previous frame for a full repaint)
  // never fires, and rows from the taller previous view linger on screen.
  const viewKey =
    view.mode === 'menu' || view.mode === 'edit' || view.mode === 'confirm-delete' || view.mode === 'ctx-model-pick'
      ? `${view.mode}:${view.connectionId}`
      : view.mode === 'model-pick'
        ? `${view.mode}:${view.connectionId}:${view.slot}:${view.scope}`
        : view.mode === 'context-window'
          ? `${view.mode}:${view.connectionId}:${view.model}`
          : view.mode;

  return (
    <Dialog title={t('Connections')} onCancel={() => onDone()}>
      <Box key={viewKey} flexDirection="column">
        {inner}
      </Box>
    </Dialog>
  );
}
