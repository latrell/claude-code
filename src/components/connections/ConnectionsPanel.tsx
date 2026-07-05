import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Dialog, Text } from '@anthropic/ink';
import {
  activateConnectionForSession,
  activateConnectionGlobally,
  clearSubagentDefault,
  getSessionAssignment,
} from '../../services/connections/activate.js';
import { importLegacyConnections } from '../../services/connections/migrate.js';
import {
  fetchRemoteModelsForConnection,
  getStaticModelsForConnection,
  type CatalogModel,
} from '../../services/connections/modelCatalog.js';
import { removeOAuthAccountSlot } from '../../services/connections/oauthAccounts.js';
import {
  _invalidateConnectionsCache,
  getDefaultAssignment,
  listConnections,
  removeConnection,
  renameConnection,
} from '../../services/connections/store.js';
import type { AgentSlot, Connection, ConnectionKind } from '../../services/connections/types.js';
import { removeChatGPTAuth } from '../../services/api/openai/chatgptAuth.js';
import { t, tf } from '../../i18n/t.js';
import { Select } from '../CustomSelect/select.js';
import { Spinner } from '../Spinner.js';
import { AddConnectionWizard } from './AddConnectionWizard.js';
import { ConnectionForm } from './ConnectionForm.js';

export type ActivationScope = 'session' | 'global';

type View =
  | { mode: 'list' }
  | { mode: 'menu'; connectionId: string }
  | {
      mode: 'model-pick';
      connectionId: string;
      slot: AgentSlot;
      scope: ActivationScope;
    }
  | { mode: 'add' }
  | { mode: 'rename'; connectionId: string }
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
function pickerModels(connection: Connection, remoteModels: string[]): CatalogModel[] {
  let models = getStaticModelsForConnection(connection);
  const needsExplicitModel =
    (connection.kind === 'openai-compat' || connection.kind === 'gemini' || connection.kind === 'grok') &&
    !connection.tierModels?.sonnet;
  if (needsExplicitModel) {
    models = models.filter(m => m.value !== null);
  }
  const seen = new Set(models.map(m => m.value ?? ''));
  for (const model of remoteModels) {
    if (seen.has(model)) continue;
    seen.add(model);
    models.push({ value: model, label: model });
  }
  return models;
}

export function ConnectionsPanel({ onDone, onMainModelChange, onAuthChanged }: Props): React.ReactNode {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [refreshTick, setRefreshTick] = useState(0);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);

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

  // Fetch live model list when entering the model picker
  useEffect(() => {
    if (view.mode !== 'model-pick') {
      setRemoteModels([]);
      return;
    }
    const connection = listConnections().find(c => c.id === view.connectionId);
    if (!connection) return;
    let cancelled = false;
    void fetchRemoteModelsForConnection(connection).then(models => {
      if (!cancelled) setRemoteModels(models);
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
      const modelSuffix = model ? ` (${model})` : '';
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
        type ListValue =
          | { type: 'connection'; id: string }
          | { type: 'add' }
          | { type: 'clear-subagent' }
          | { type: 'close' };
        const options: Array<{
          label: string;
          value: ListValue;
          description?: string;
        }> = [
          ...connections.map(connection => ({
            label: connection.label,
            value: { type: 'connection', id: connection.id } as ListValue,
            description: connectionDetail(connection),
          })),
          { label: t('+ Add connection…'), value: { type: 'add' } },
          ...(hasSubagentDefault
            ? [
                {
                  label: t('Clear subagent default (inherit main)'),
                  value: { type: 'clear-subagent' } as ListValue,
                },
              ]
            : []),
          { label: t('Close'), value: { type: 'close' } },
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
                switch (value.type) {
                  case 'connection':
                    setView({ mode: 'menu', connectionId: value.id });
                    return;
                  case 'add':
                    setView({ mode: 'add' });
                    return;
                  case 'clear-subagent': {
                    clearSubagentDefault();
                    refresh();
                    return;
                  }
                  case 'close':
                    onDone();
                    return;
                  default:
                    return;
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
        type MenuValue =
          | { type: 'activate'; slot: AgentSlot; scope: ActivationScope }
          | { type: 'rename' }
          | { type: 'delete' }
          | { type: 'back' };
        return (
          <Box flexDirection="column" gap={1}>
            <Text bold>{connection.label}</Text>
            <Text dimColor>{connectionDetail(connection)}</Text>
            <Select
              options={[
                {
                  label: t('Use for this session (main agent)'),
                  value: { type: 'activate', slot: 'main', scope: 'session' } as MenuValue,
                },
                {
                  label: t('Set as global default (main agent)'),
                  value: { type: 'activate', slot: 'main', scope: 'global' } as MenuValue,
                },
                {
                  label: t('Use for this session (subagents)'),
                  value: { type: 'activate', slot: 'subagent', scope: 'session' } as MenuValue,
                },
                {
                  label: t('Set as global default (subagents)'),
                  value: { type: 'activate', slot: 'subagent', scope: 'global' } as MenuValue,
                },
                { label: t('Rename'), value: { type: 'rename' } as MenuValue },
                { label: t('Delete'), value: { type: 'delete' } as MenuValue },
                { label: t('Back'), value: { type: 'back' } as MenuValue },
              ]}
              visibleOptionCount={7}
              onCancel={() => setView({ mode: 'list' })}
              onChange={value => {
                switch (value.type) {
                  case 'activate':
                    setView({
                      mode: 'model-pick',
                      connectionId: connection.id,
                      slot: value.slot,
                      scope: value.scope,
                    });
                    return;
                  case 'rename':
                    setView({ mode: 'rename', connectionId: connection.id });
                    return;
                  case 'delete':
                    setView({ mode: 'confirm-delete', connectionId: connection.id });
                    return;
                  case 'back':
                    setView({ mode: 'list' });
                    return;
                  default:
                    return;
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
              void doActivate(connection, view.slot, view.scope, trimmed);
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
                void doActivate(connection, view.slot, view.scope, value === '__default__' ? null : value);
              }}
            />
          </Box>
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

      case 'rename': {
        const connection = connections.find(c => c.id === view.connectionId);
        if (!connection) {
          setView({ mode: 'list' });
          return null;
        }
        return (
          <ConnectionForm
            title={t('Rename connection')}
            fields={[
              {
                key: 'label',
                label: t('Name'),
                required: true,
                initialValue: connection.label,
              },
            ]}
            onCancel={() => setView({ mode: 'menu', connectionId: connection.id })}
            onSubmit={values => {
              renameConnection(connection.id, values['label'] ?? connection.label);
              refresh();
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

  return (
    <Dialog title={t('Connections')} onCancel={() => onDone()}>
      <Box flexDirection="column">{inner}</Box>
    </Dialog>
  );
}
