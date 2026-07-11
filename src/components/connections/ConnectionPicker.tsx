import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, FuzzyPicker, Text } from '@anthropic/ink';
import { getSessionAssignment } from '../../services/connections/activate.js';
import { importLegacyConnections } from '../../services/connections/migrate.js';
import { connectionProfileSummary } from '../../services/connections/profile.js';
import { switchSlotToConnection } from '../../services/connections/slotSwitch.js';
import { getDefaultAssignment, listConnections } from '../../services/connections/store.js';
import type { AgentSlot, Connection } from '../../services/connections/types.js';
import { t } from '../../i18n/t.js';
import { Spinner } from '../Spinner.js';
import { kindDisplayName } from './ConnectionsPanel.js';

type ConnectionPickItem = {
  connection: Connection;
  searchText: string;
};

type Props = {
  /** Agent slot the picker switches ('main' for /provider, 'subagent' for /subagent-provider, 'fast' for /fast-provider). */
  slot: AgentSlot;
  onDone: (message?: string) => void;
  /** Applied on main-slot switches so AppState.mainLoopModel follows the connection. */
  onMainModelChange?: (model: string | null) => void;
  /** Credentials may change on activation (OAuth slot switch) — mirrors /connect. */
  onAuthChanged?: () => void;
};

function buildItems(connections: Connection[]): ConnectionPickItem[] {
  return connections.map(connection => ({
    connection,
    searchText:
      `${connection.label} ${connection.id} ${kindDisplayName(connection.kind)} ${connection.model ?? ''}`.toLowerCase(),
  }));
}

function itemMarkers(connection: Connection, slot: AgentSlot): string {
  const markers: string[] = [];
  if (getSessionAssignment(slot)?.connectionId === connection.id) {
    markers.push('●');
  }
  if (getDefaultAssignment(slot)?.connectionId === connection.id) {
    markers.push('★');
  }
  return markers.length > 0 ? ` ${markers.join(' ')}` : '';
}

function connectionDetails(connection: Connection): string {
  return [kindDisplayName(connection.kind), connectionProfileSummary(connection)].join(' · ');
}

/**
 * Connection selector for /provider (slot 'main'), /subagent-provider
 * (slot 'subagent') and /fast-provider (slot 'fast'). Enter activates for
 * this session, Shift+Tab persists the connection as the slot's global
 * default, Esc cancels.
 */
export function ConnectionPicker({ slot, onDone, onMainModelChange, onAuthChanged }: Props): React.ReactNode {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    importLegacyConnections();
    setConnections(listConnections());
  }, []);

  const allItems = useMemo(() => buildItems(connections), [connections]);

  const filteredItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return allItems;
    const terms = trimmed.split(/\s+/);
    return allItems.filter(item => terms.every(term => item.searchText.includes(term)));
  }, [allItems, query]);

  const doActivate = useCallback(
    async (item: ConnectionPickItem, scope: 'session' | 'global') => {
      setBusy(t('Switching…'));
      setError(null);
      const result = await switchSlotToConnection(item.connection, slot, scope);
      if (!result.success) {
        setBusy(null);
        setError(result.error);
        return;
      }
      if (slot === 'main') {
        onMainModelChange?.(result.mainLoopModel ?? null);
      }
      onAuthChanged?.();
      onDone(result.message);
    },
    [slot, onDone, onMainModelChange, onAuthChanged],
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
      <FuzzyPicker<ConnectionPickItem>
        title={
          slot === 'main'
            ? t('Select connection — main agent')
            : slot === 'fast'
              ? t('Select connection — fast (HAIKU) calls')
              : t('Select connection — subagents')
        }
        placeholder={t('Search connections…')}
        items={filteredItems}
        getKey={item => item.connection.id}
        renderItem={(item, isFocused) => (
          <Text>
            <Text bold={isFocused}>{item.connection.label}</Text>
            <Text color="success">{itemMarkers(item.connection, slot)}</Text>
            <Text dimColor> · {connectionDetails(item.connection)}</Text>
          </Text>
        )}
        visibleCount={10}
        onQueryChange={setQuery}
        onSelect={item => {
          void doActivate(item, 'session');
        }}
        selectAction={t('use for this session')}
        onShiftTab={{
          action: t('set global default'),
          handler: item => {
            void doActivate(item, 'global');
          },
        }}
        onCancel={() => onDone()}
        emptyMessage={t('No connections match — add connections via /connect')}
        extraHints={<Text dimColor>{t('● current session · ★ global default')}</Text>}
      />
    </Box>
  );
}
