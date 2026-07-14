import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Dialog, Text } from '@anthropic/ink';
import {
  activateConnectionForSession,
  activateConnectionGlobally,
  clearFastDefault,
  clearSonnetDefault,
  clearSubagentDefault,
  getSessionAssignment,
  removeConnectionWithRuntimeCleanup,
} from '../../services/connections/activate.js';
import {
  formatContextWindow,
  getModelContextWindowForConnection,
  parseContextWindowInput,
} from '../../services/connections/contextWindows.js';
import { importLegacyConnections } from '../../services/connections/migrate.js';
import {
  fetchAndRecordRemoteModels,
  connectionModelDisplayName,
  pickerModelsForConnection,
  supportsRemoteModelList,
  type RemoteModel,
} from '../../services/connections/modelCatalog.js';
import { removeOAuthAccountSlot } from '../../services/connections/oauthAccounts.js';
import {
  connectionProfileSummary,
  connectionEffortSummary,
  connectionDisplayName,
  connectionRequiresPinnedModel,
  duplicateConnection,
  withContextWindow,
  withPinnedModel,
} from '../../services/connections/profile.js';
import {
  _invalidateConnectionsCache,
  findConnection,
  generateConnectionId,
  getDefaultAssignment,
  listConnections,
  updateConnectionModel,
  upsertConnection,
} from '../../services/connections/store.js';
import type { AgentSlot, Connection, ConnectionKind } from '../../services/connections/types.js';
import { removeChatGPTAuth } from '../../services/api/openai/chatgptAuth.js';
import { removeCursorOAuth } from '../../services/api/cursor/cursorOAuth.js';
import { useAppState } from '../../state/AppState.js';
import { t, tf } from '../../i18n/t.js';
import { Select } from '../CustomSelect/select.js';
import { Spinner } from '../Spinner.js';
import { AddConnectionWizard } from './AddConnectionWizard.js';
import { ConnectionForm, type ConnectionFormField } from './ConnectionForm.js';
import { ConnectionSelect } from './ConnectionSelect.js';
import { ThinkingEffortPicker } from './ThinkingEffortPicker.js';

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
  'activate:fast:session': { slot: 'fast', scope: 'session' },
  'activate:fast:global': { slot: 'fast', scope: 'global' },
  'activate:sonnet:session': { slot: 'sonnet', scope: 'session' },
  'activate:sonnet:global': { slot: 'sonnet', scope: 'global' },
};

type PendingActivation = { slot: AgentSlot; scope: ActivationScope };

type View =
  | { mode: 'list' }
  | { mode: 'menu'; connectionId: string }
  /**
   * Model picker for a connection. `next` carries the pending activation
   * when this step guards an activate action (connection had no pinned
   * model yet); null = "Change pinned model…" from the connection menu.
   * Picking a model always pins it (updateConnectionModel).
   */
  | { mode: 'model-pick'; connectionId: string; next: PendingActivation | null }
  /**
   * Connection-level context window editor. `next` carries the pending
   * activation when reached from the model picker (window unknown for the
   * freshly pinned model); null = editing from the connection menu.
   */
  | { mode: 'context-window'; connectionId: string; next: PendingActivation | null }
  | { mode: 'effort'; connectionId: string }
  | { mode: 'duplicate'; connectionId: string }
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
  if (getDefaultAssignment('fast')?.connectionId === connection.id) {
    badges.push(t('fast default'));
  }
  if (getDefaultAssignment('sonnet')?.connectionId === connection.id) {
    badges.push(t('sonnet default'));
  }
  if (getSessionAssignment('main')?.connectionId === connection.id) {
    badges.push(t('in use (main)'));
  }
  if (getSessionAssignment('subagent')?.connectionId === connection.id) {
    badges.push(t('in use (subagent)'));
  }
  if (getSessionAssignment('fast')?.connectionId === connection.id) {
    badges.push(t('in use (fast)'));
  }
  if (getSessionAssignment('sonnet')?.connectionId === connection.id) {
    badges.push(t('in use (sonnet)'));
  }
  return badges;
}

function connectionDetail(connection: Connection): string {
  const parts: string[] = [kindDisplayName(connection.kind)];
  if (connection.accountEmail) parts.push(connection.accountEmail);
  else if (connection.baseUrl) parts.push(connection.baseUrl);
  parts.push(connectionProfileSummary(connection));
  const badges = connectionBadges(connection);
  if (badges.length > 0) parts.push(badges.join(' · '));
  return parts.join(' · ');
}

/** Kinds where a connection-level context window entry is meaningful. */
function hasContextConfig(kind: ConnectionKind): boolean {
  return kind !== 'anthropic-oauth' && kind !== 'chatgpt-oauth';
}

/**
 * Whether activating this connection should route through the context
 * window step: third-party kinds only, and only when neither the
 * connection-level window nor a per-model/preset window for the pinned
 * model is known. Once configured, activation proceeds directly.
 */
function needsContextWindowPrompt(connection: Connection): boolean {
  if (!supportsRemoteModelList(connection.kind)) return false;
  if (connection.contextWindow !== undefined) return false;
  const model = connection.model;
  if (!model) return true;
  return getModelContextWindowForConnection(connection, model) === undefined;
}

export function ConnectionsPanel({ onDone, onMainModelChange, onAuthChanged }: Props): React.ReactNode {
  const appStateEffort = useAppState(state => state.effortValue);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [refreshTick, setRefreshTick] = useState(0);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Holds the "Custom model…" text field value so activation only fires on
  // Enter (Select's onChange with '__custom__'), not on every keystroke.
  const [customModelInput, setCustomModelInput] = useState('');

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
    // Reset the custom-model field between picker visits so a value typed in
    // one picker can't leak into another.
    setCustomModelInput('');
    if (view.mode !== 'model-pick') {
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
    async (connection: Connection, slot: AgentSlot, scope: ActivationScope, model?: string | null) => {
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
      const fresh = listConnections().find(c => c.id === connection.id) ?? connection;
      const effectiveModel = model ?? fresh.model;
      let modelSuffix = '';
      if (effectiveModel) {
        const displayModel = connectionModelDisplayName(fresh, effectiveModel);
        const ctx =
          fresh.contextWindow ??
          (supportsRemoteModelList(fresh.kind)
            ? getModelContextWindowForConnection(fresh, effectiveModel)?.tokens
            : undefined);
        modelSuffix = ctx ? ` (${displayModel} · ctx ${formatContextWindow(ctx)})` : ` (${displayModel})`;
      }
      const message =
        slot === 'main'
          ? scope === 'global'
            ? tf('{label}{model} is now the global default', {
                label: connectionDisplayName(connection),
                model: modelSuffix,
              })
            : tf('Using {label}{model} for this session', {
                label: connectionDisplayName(connection),
                model: modelSuffix,
              })
          : slot === 'fast'
            ? scope === 'global'
              ? tf('{label}{model} is now the fast (HAIKU) default', {
                  label: connectionDisplayName(connection),
                  model: modelSuffix,
                })
              : tf('Fast (HAIKU) calls use {label}{model} for this session', {
                  label: connectionDisplayName(connection),
                  model: modelSuffix,
                })
            : slot === 'sonnet'
              ? scope === 'global'
                ? tf('{label}{model} is now the sonnet (SONNET tier) default', {
                    label: connectionDisplayName(connection),
                    model: modelSuffix,
                  })
                : tf('Sonnet (SONNET tier) calls use {label}{model} for this session', {
                    label: connectionDisplayName(connection),
                    model: modelSuffix,
                  })
              : scope === 'global'
                ? tf('{label}{model} is now the subagent default', {
                    label: connectionDisplayName(connection),
                    model: modelSuffix,
                  })
                : tf('Subagents use {label}{model} for this session', {
                    label: connectionDisplayName(connection),
                    model: modelSuffix,
                  });
      onDone(message);
    },
    [onDone, onMainModelChange, onAuthChanged],
  );

  /**
   * Redeploy a connection to every slot it is currently active in, after a
   * profile edit from the menu (pinned model / thinking effort). Global when
   * the connection is the slot's global default (persisted deployment stays
   * in sync), session-only when it is merely the session assignment.
   */
  const redeployIfActive = useCallback(
    async (connectionId: string) => {
      const fresh = findConnection(connectionId);
      if (!fresh) return;
      let touched = false;
      for (const slot of ['main', 'subagent', 'fast', 'sonnet'] as const) {
        const isDefault = getDefaultAssignment(slot)?.connectionId === fresh.id;
        const isSession = getSessionAssignment(slot)?.connectionId === fresh.id;
        if (!isDefault && !isSession) continue;
        const result = isDefault
          ? await activateConnectionGlobally(fresh, slot)
          : await activateConnectionForSession(fresh, slot);
        if (result.success && slot === 'main') {
          onMainModelChange(result.mainLoopModel ?? null);
        }
        touched = true;
      }
      if (touched) onAuthChanged();
    },
    [onMainModelChange, onAuthChanged],
  );

  const doDelete = useCallback(
    (connection: Connection) => {
      try {
        const { error } = removeConnectionWithRuntimeCleanup(connection);
        if (error) throw error;
        if (connection.kind === 'anthropic-oauth' && connection.credentialRef) {
          removeOAuthAccountSlot(connection.credentialRef);
        }
        if (connection.kind === 'chatgpt-oauth' && connection.credentialRef && connection.credentialRef !== 'default') {
          void removeChatGPTAuth(connection.credentialRef).catch(() => {});
        }
        if (connection.kind === 'cursor' && connection.credentialRef && connection.credentialRef !== 'default') {
          void removeCursorOAuth(connection.credentialRef).catch(() => {});
        }
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
        const hasFastDefault = getDefaultAssignment('fast') !== undefined;
        const hasSonnetDefault = getDefaultAssignment('sonnet') !== undefined;
        const options: Array<{
          label: string;
          value: string;
          description?: string;
        }> = [
          ...connections.map(connection => ({
            label: connectionDisplayName(connection),
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
          ...(hasFastDefault
            ? [
                {
                  label: t('Clear fast default (inherit main)'),
                  value: 'clear-fast',
                },
              ]
            : []),
          ...(hasSonnetDefault
            ? [
                {
                  label: t('Clear sonnet default (inherit main)'),
                  value: 'clear-sonnet',
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
                } else if (value === 'clear-fast') {
                  clearFastDefault();
                  refresh();
                } else if (value === 'clear-sonnet') {
                  clearSonnetDefault();
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
            <Text bold>{connectionDisplayName(connection)}</Text>
            <Text dimColor>{connectionDetail(connection)}</Text>
            <ConnectionSelect
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
                {
                  label: t('Use for this session (fast/HAIKU calls)'),
                  value: 'activate:fast:session',
                },
                {
                  label: t('Set as global default (fast/HAIKU calls)'),
                  value: 'activate:fast:global',
                },
                {
                  label: t('Use for this session (sonnet-tier calls)'),
                  value: 'activate:sonnet:session',
                },
                {
                  label: t('Set as global default (sonnet-tier calls)'),
                  value: 'activate:sonnet:global',
                },
                {
                  label: t('Change pinned model…'),
                  value: 'model',
                  description: connection.model ? connectionModelDisplayName(connection, connection.model) : undefined,
                },
                ...(connection.kind !== 'cursor'
                  ? [
                      {
                        label: t('Thinking effort…'),
                        value: 'effort',
                        description: connection.thinkingEffort ? connectionEffortSummary(connection) : undefined,
                      },
                    ]
                  : []),
                ...(hasContextConfig(connection.kind)
                  ? [
                      {
                        label: t('Context window…'),
                        value: 'ctx',
                        description: connection.contextWindow
                          ? formatContextWindow(connection.contextWindow)
                          : undefined,
                      },
                    ]
                  : []),
                { label: t('Duplicate connection…'), value: 'duplicate' },
                { label: t('Edit'), value: 'edit' },
                { label: t('Delete'), value: 'delete' },
              ]}
              visibleOptionCount={11}
              onBack={() => setView({ mode: 'list' })}
              onCancel={() => setView({ mode: 'list' })}
              onChange={value => {
                const activation = ACTIVATION_MENU_ACTIONS[value];
                if (activation) {
                  // Activation deploys the connection profile as-is; only a
                  // key-based third-party connection without a pinned model
                  // needs the guided model pick first.
                  if (!connection.model && connectionRequiresPinnedModel(connection.kind)) {
                    setView({
                      mode: 'model-pick',
                      connectionId: connection.id,
                      next: activation,
                    });
                  } else {
                    void doActivate(connection, activation.slot, activation.scope);
                  }
                  return;
                }
                if (value === 'model') {
                  setView({ mode: 'model-pick', connectionId: connection.id, next: null });
                } else if (value === 'effort') {
                  setView({ mode: 'effort', connectionId: connection.id });
                } else if (value === 'ctx') {
                  setView({ mode: 'context-window', connectionId: connection.id, next: null });
                } else if (value === 'duplicate') {
                  setView({ mode: 'duplicate', connectionId: connection.id });
                } else if (value === 'edit') {
                  setView({ mode: 'edit', connectionId: connection.id });
                } else if (value === 'delete') {
                  setView({ mode: 'confirm-delete', connectionId: connection.id });
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
        const models = pickerModelsForConnection(connection, remoteModels);
        // Picking a concrete model pins it to the connection profile. On the
        // guided activation path a still-unknown context window inserts the
        // (skippable) window step before activating; on the menu path the
        // active slots are redeployed so the change applies immediately.
        const pickModel = (model: string | null) => {
          if (model === null) {
            if (view.next) {
              void doActivate(connection, view.next.slot, view.next.scope, null);
            } else {
              // Menu path: "Default" clears the pinned model (provider default)
              upsertConnection(withPinnedModel(connection, undefined));
              refresh();
              setView({ mode: 'menu', connectionId: connection.id });
            }
            return;
          }
          updateConnectionModel(connection.id, model);
          refresh();
          const fresh = findConnection(connection.id) ?? connection;
          if (view.next) {
            if (needsContextWindowPrompt(fresh)) {
              setView({
                mode: 'context-window',
                connectionId: connection.id,
                next: view.next,
              });
              return;
            }
            void doActivate(fresh, view.next.slot, view.next.scope);
            return;
          }
          void redeployIfActive(connection.id);
          setView({ mode: 'menu', connectionId: connection.id });
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
            onChange: setCustomModelInput,
          },
        ];
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>
              {view.next
                ? view.next.slot === 'main'
                  ? t('Pick a model (main agent)')
                  : t('Pick a model (subagents)')
                : tf('Change pinned model — {label}', { label: connectionDisplayName(connection) })}
            </Text>
            <Text dimColor>
              {view.next
                ? view.next.scope === 'global'
                  ? t('Persists across sessions')
                  : t('This session only')
                : t('The selected model is pinned to this connection profile')}
            </Text>
            <ConnectionSelect
              options={options}
              visibleOptionCount={10}
              onBack={() => setView({ mode: 'menu', connectionId: connection.id })}
              onCancel={() => setView({ mode: 'menu', connectionId: connection.id })}
              onChange={value => {
                if (value === '__custom__') {
                  const trimmed = customModelInput.trim();
                  if (trimmed) pickModel(trimmed);
                  return;
                }
                pickModel(value === '__default__' ? null : value);
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
        const current = connection.contextWindow;
        const detected =
          current ??
          (connection.model ? getModelContextWindowForConnection(connection, connection.model)?.tokens : undefined);
        const backView: View = view.next
          ? { mode: 'model-pick', connectionId: connection.id, next: view.next }
          : { mode: 'menu', connectionId: connection.id };
        const proceed = () => {
          if (view.next) {
            const fresh = findConnection(connection.id) ?? connection;
            void doActivate(fresh, view.next.slot, view.next.scope);
          } else {
            refresh();
            setView({ mode: 'menu', connectionId: connection.id });
          }
        };
        return (
          <ConnectionForm
            title={tf('Context window — {label}', { label: connectionDisplayName(connection) })}
            subtitle={
              current !== undefined
                ? tf('Current: {value} tokens', { value: String(current) })
                : detected !== undefined
                  ? tf('Detected: {value} tokens — Enter to accept', { value: String(detected) })
                  : t('Not reported by the provider — enter it to size auto-compact correctly (200K assumed otherwise)')
            }
            fields={[
              {
                key: 'contextWindow',
                label: t('Context window'),
                initialValue: detected !== undefined ? String(detected) : '',
                placeholder: view.next
                  ? t('e.g. 128K or 1M — leave empty to skip')
                  : t('e.g. 128K or 1M — leave empty to clear'),
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
                  // Menu edit path: empty clears the connection-level window
                  upsertConnection(withContextWindow(connection, undefined));
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
              upsertConnection(withContextWindow(connection, tokens));
              proceed();
            }}
          />
        );
      }

      case 'effort': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        const apply = (next: Connection) => {
          upsertConnection(next);
          refresh();
          void redeployIfActive(connection.id);
          setView({ mode: 'menu', connectionId: connection.id });
        };
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>{tf('Thinking effort — {label}', { label: connectionDisplayName(connection) })}</Text>
            <Text dimColor>
              {t('Configured value → actual request value (environment and /effort overrides take priority)')}
            </Text>
            <ThinkingEffortPicker
              connection={connection}
              appStateEffort={appStateEffort}
              onCancel={() => setView({ mode: 'menu', connectionId: connection.id })}
              onChange={apply}
            />
          </Box>
        );
      }

      case 'duplicate': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        return (
          <ConnectionForm
            title={tf('Duplicate connection — {label}', { label: connectionDisplayName(connection) })}
            subtitle={t(
              'Copies credentials and profile (model, thinking effort, context window) into a new connection',
            )}
            fields={[
              {
                key: 'label',
                label: t('Name'),
                required: true,
                initialValue: `${connection.label} 2`,
              },
            ]}
            submitError={submitError}
            onCancel={() => {
              setSubmitError(null);
              setView({ mode: 'menu', connectionId: connection.id });
            }}
            onSubmit={values => {
              const label = values['label'] || `${connection.label} 2`;
              try {
                const copy = duplicateConnection(connection, generateConnectionId(label), label);
                upsertConnection(copy);
                refresh();
                setSubmitError(null);
                setView({ mode: 'menu', connectionId: copy.id });
              } catch (err) {
                setSubmitError(err instanceof Error ? err.message : String(err));
              }
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
                label: connectionDisplayName(connection),
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
            <ConnectionSelect options={[]} onBack={() => setView(view.back)} onCancel={() => setView(view.back)} />
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
    view.mode === 'menu' ||
    view.mode === 'edit' ||
    view.mode === 'confirm-delete' ||
    view.mode === 'effort' ||
    view.mode === 'duplicate'
      ? `${view.mode}:${view.connectionId}`
      : view.mode === 'model-pick' || view.mode === 'context-window'
        ? `${view.mode}:${view.connectionId}:${view.next ? `${view.next.slot}:${view.next.scope}` : 'menu'}`
        : view.mode;

  return (
    <Dialog title={t('Connections')} onCancel={() => onDone()} hideInputGuide>
      <Box key={viewKey} flexDirection="column">
        {inner}
      </Box>
    </Dialog>
  );
}
