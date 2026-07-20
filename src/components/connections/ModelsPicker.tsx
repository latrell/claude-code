import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, FuzzyPicker, Text } from '@anthropic/ink';
import {
  activateConnectionForSession,
  activateConnectionGlobally,
  getSessionAssignment,
} from '../../services/connections/activate.js';
import { formatContextWindow, getModelContextWindowForConnection } from '../../services/connections/contextWindows.js';
import { importLegacyConnections } from '../../services/connections/migrate.js';
import {
  fetchAndRecordRemoteModels,
  pickerModelsForConnection,
  supportsRemoteModelList,
  type CatalogModel,
  type RemoteModel,
} from '../../services/connections/modelCatalog.js';
import {
  findConnection,
  getDefaultAssignment,
  listConnections,
  updateConnectionModel,
} from '../../services/connections/store.js';
import type { AgentSlot, Connection } from '../../services/connections/types.js';
import { t, tf } from '../../i18n/t.js';
import { connectionDisplayName } from '../../services/connections/profile.js';
import { Spinner } from '../Spinner.js';
import { kindDisplayName } from './ConnectionsPanel.js';

type ModelPickItem = {
  key: string;
  connection: Connection;
  model: CatalogModel;
  searchText: string;
};

type Props = {
  onDone: (message?: string) => void;
  onMainModelChange: (model: string | null) => void;
  onAuthChanged: () => void;
  initialSlot?: AgentSlot;
  /**
   * When set, the picker only lists this connection's models. Used by /model
   * to scope the menu to the active third-party provider so the selection
   * actually applies (env-mapped providers ignore AppState.mainLoopModel).
   */
  connectionId?: string;
  /**
   * When true, selecting a concrete model pins it to the connection profile
   * (updateConnectionModel → ccb-connections.json) instead of being a
   * session-only value, then redeploys the connection. If the connection is
   * the slot's global default the redeploy is global so the persisted
   * deployment (settings/providerModels/credential stores) follows too.
   * Used by /model when the main agent runs on a connection.
   */
  pinModelToConnection?: boolean;
};

function buildItems(connections: Connection[], remoteModels: Record<string, RemoteModel[]>): ModelPickItem[] {
  const items: ModelPickItem[] = [];
  for (const connection of connections) {
    const models = pickerModelsForConnection(connection, remoteModels[connection.id] ?? []);
    for (const model of models) {
      items.push({
        key: `${connection.id}\u0000${model.value ?? '__default__'}`,
        connection,
        model,
        searchText:
          `${connectionDisplayName(connection)} ${connection.label} ${kindDisplayName(connection.kind)} ${model.label} ${model.value ?? ''}`.toLowerCase(),
      });
    }
  }
  return items;
}

function itemMarkers(item: ModelPickItem, slot: AgentSlot): string {
  const markers: string[] = [];
  const session = getSessionAssignment(slot);
  if (session?.connectionId === item.connection.id && (session.model ?? null) === item.model.value) {
    markers.push('●');
  }
  const globalDefault = getDefaultAssignment(slot);
  if (globalDefault?.connectionId === item.connection.id && (globalDefault.model ?? null) === item.model.value) {
    markers.push('★');
  }
  return markers.length > 0 ? ` ${markers.join(' ')}` : '';
}

export function ModelsPicker({
  onDone,
  onMainModelChange,
  onAuthChanged,
  initialSlot = 'main',
  connectionId,
  pinModelToConnection = false,
}: Props): React.ReactNode {
  const [slot, setSlot] = useState<AgentSlot>(initialSlot);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<Record<string, RemoteModel[]>>({});
  const [connections, setConnections] = useState<Connection[]>([]);

  // Import legacy config once, load the registry, then fetch live model
  // lists (best-effort). Detected context windows are recorded onto the
  // connections, so the registry is re-read after each fetch resolves.
  useEffect(() => {
    importLegacyConnections();
    const scope = (all: Connection[]) => (connectionId ? all.filter(c => c.id === connectionId) : all);
    const initial = scope(listConnections());
    setConnections(initial);
    let cancelled = false;
    for (const connection of initial) {
      if (!supportsRemoteModelList(connection.kind)) {
        continue;
      }
      void fetchAndRecordRemoteModels(connection).then(models => {
        if (cancelled || models.length === 0) return;
        setRemoteModels(prev => ({ ...prev, [connection.id]: models }));
        setConnections(scope(listConnections()));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const allItems = useMemo(() => buildItems(connections, remoteModels), [connections, remoteModels]);

  const filteredItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return allItems;
    const terms = trimmed.split(/\s+/);
    return allItems.filter(item => terms.every(term => item.searchText.includes(term)));
  }, [allItems, query]);

  const doActivate = useCallback(
    async (item: ModelPickItem, scope: 'session' | 'global') => {
      setBusy(t('Switching…'));
      setError(null);
      let connection = item.connection;
      let effectiveScope = scope;
      // Pin mode (/model on a connection): the selection writes the model
      // straight to the connection profile, then redeploys the refreshed
      // connection. When the connection is the slot's global default, the
      // redeploy is global so the persisted deployment stays in sync.
      const pinned = pinModelToConnection && item.model.value !== null;
      if (pinned && item.model.value) {
        updateConnectionModel(connection.id, item.model.value);
        connection = findConnection(connection.id) ?? connection;
        if (getDefaultAssignment(slot)?.connectionId === connection.id) {
          effectiveScope = 'global';
        }
      }
      const result =
        effectiveScope === 'global'
          ? await activateConnectionGlobally(connection, slot, item.model.value)
          : await activateConnectionForSession(connection, slot, item.model.value);
      if (!result.success) {
        setBusy(null);
        setError(result.error ?? t('Failed to switch model.'));
        return;
      }
      if (slot === 'main') {
        onMainModelChange(result.mainLoopModel ?? null);
      }
      onAuthChanged();
      let ctxSuffix = '';
      if (item.model.value && supportsRemoteModelList(connection.kind)) {
        // Surface the effective context window so a wrong/missing detection
        // is visible right where the model was switched.
        const fresh = listConnections().find(c => c.id === connection.id) ?? connection;
        const ctx = getModelContextWindowForConnection(fresh, item.model.value);
        ctxSuffix = ctx
          ? ` · ctx ${formatContextWindow(ctx.tokens)}`
          : ` · ${t('ctx unknown, 200K assumed — set via /connect')}`;
      }
      const target = `${connectionDisplayName(connection)} / ${item.model.label}${ctxSuffix}`;
      const message = pinned
        ? tf('Connection {label} model set to {target}', {
            label: connectionDisplayName(connection),
            target: `${item.model.label}${ctxSuffix}`,
          })
        : slot === 'main'
          ? scope === 'global'
            ? tf('Global default model set to {target}', { target })
            : tf('Session model set to {target}', { target })
          : scope === 'global'
            ? tf('Global subagent model set to {target}', { target })
            : tf('Session subagent model set to {target}', { target });
      onDone(message);
    },
    [slot, onDone, onMainModelChange, onAuthChanged, pinModelToConnection],
  );

  if (busy) {
    return (
      <Box>
        <Spinner />
        <Text>{busy}</Text>
      </Box>
    );
  }

  if (connections.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t('No provider connections configured yet.')}</Text>
        <Text dimColor>{t('Run /connect to add providers and accounts first.')}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {error ? <Text color="error">{error}</Text> : null}
      <FuzzyPicker<ModelPickItem>
        title={slot === 'main' ? t('Select model — main agent') : t('Select model — subagents')}
        placeholder={t('Search connections and models…')}
        items={filteredItems}
        getKey={item => item.key}
        renderItem={(item, isFocused) => (
          <Text color={isFocused ? undefined : undefined}>
            <Text bold={isFocused}>{connectionDisplayName(item.connection)}</Text>
            <Text dimColor> / </Text>
            <Text bold={isFocused}>{item.model.label}</Text>
            <Text color="success">{itemMarkers(item, slot)}</Text>
            {item.model.description ? <Text dimColor> · {item.model.description}</Text> : null}
          </Text>
        )}
        visibleCount={10}
        onQueryChange={setQuery}
        onSelect={item => {
          void doActivate(item, 'session');
        }}
        selectAction={t('use for this session')}
        onTab={{
          action: slot === 'main' ? t('subagent slot') : t('main slot'),
          handler: () => {
            setSlot(current => (current === 'main' ? 'subagent' : 'main'));
          },
        }}
        onShiftTab={{
          action: t('set global default'),
          handler: item => {
            void doActivate(item, 'global');
          },
        }}
        onCancel={() => onDone()}
        emptyMessage={t('No models match — add connections via /connect')}
        extraHints={<Text dimColor>{t('● current session · ★ global default')}</Text>}
      />
    </Box>
  );
}
