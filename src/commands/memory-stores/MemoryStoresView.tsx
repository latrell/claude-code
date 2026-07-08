import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { Memory, MemoryStore, MemoryVersion } from './memoryStoresApi.js';
import { t, tf } from '../../i18n/t.js';

type Props =
  | { mode: 'list'; stores: MemoryStore[] }
  | { mode: 'detail'; store: MemoryStore }
  | { mode: 'created'; store: MemoryStore }
  | { mode: 'archived'; store: MemoryStore }
  | { mode: 'memory-list'; storeId: string; memories: Memory[] }
  | { mode: 'memory-detail'; memory: Memory }
  | { mode: 'memory-created'; memory: Memory }
  | { mode: 'memory-updated'; memory: Memory }
  | { mode: 'memory-deleted'; storeId: string; memoryId: string }
  | { mode: 'versions'; storeId: string; versions: MemoryVersion[] }
  | { mode: 'redacted'; version: MemoryVersion }
  | { mode: 'error'; message: string };

function StoreRow({ store }: { store: MemoryStore }): React.ReactNode {
  const isArchived = !!store.archived_at;
  const createdAt = store.created_at ? new Date(store.created_at).toLocaleString() : '—';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{store.memory_store_id}</Text>
        <Text dimColor> · </Text>
        <Text color={(isArchived ? 'warning' : 'success') as keyof Theme}>
          {isArchived ? t('archived') : t('active')}
        </Text>
        {store.namespace ? (
          <>
            <Text dimColor> · ns: </Text>
            <Text>{store.namespace}</Text>
          </>
        ) : null}
      </Box>
      <Text>{tf('Name: {name}', { name: store.name })}</Text>
      <Text dimColor>{tf('Created: {createdAt}', { createdAt })}</Text>
    </Box>
  );
}

export function MemoryStoresView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.stores.length === 0) {
      return (
        <Box>
          <Text dimColor>{t('No memory stores found. Use /memory-stores create <name> to create one.')}</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Memory Stores ({count})', { count: props.stores.length })}</Text>
        </Box>
        {props.stores.map(store => (
          <StoreRow key={store.memory_store_id} store={store} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'detail') {
    const { store } = props;
    const isArchived = !!store.archived_at;
    const createdAt = store.created_at ? new Date(store.created_at).toLocaleString() : '—';
    const archivedAt = store.archived_at ? new Date(store.archived_at).toLocaleString() : null;
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Memory Store: {id}', { id: store.memory_store_id })}</Text>
        </Box>
        <Text>{tf('Name: {name}', { name: store.name })}</Text>
        {store.namespace ? <Text>{tf('Namespace: {namespace}', { namespace: store.namespace })}</Text> : null}
        <Text>
          {t('Status:')}{' '}
          <Text color={(isArchived ? 'warning' : 'success') as keyof Theme}>
            {isArchived ? t('archived') : t('active')}
          </Text>
        </Text>
        <Text dimColor>{tf('Created: {createdAt}', { createdAt })}</Text>
        {archivedAt ? <Text dimColor>{tf('Archived: {archivedAt}', { archivedAt })}</Text> : null}
      </Box>
    );
  }

  if (props.mode === 'created') {
    const { store } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Memory store created')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: store.memory_store_id })}</Text>
        <Text>{tf('Name: {name}', { name: store.name })}</Text>
        {store.namespace ? <Text>{tf('Namespace: {namespace}', { namespace: store.namespace })}</Text> : null}
      </Box>
    );
  }

  if (props.mode === 'archived') {
    const { store } = props;
    const archivedAt = store.archived_at ? new Date(store.archived_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'warning' as keyof Theme}>
            {t('Memory store archived')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: store.memory_store_id })}</Text>
        <Text dimColor>{tf('Archived at: {archivedAt}', { archivedAt })}</Text>
      </Box>
    );
  }

  if (props.mode === 'memory-list') {
    const { storeId, memories } = props;
    if (memories.length === 0) {
      return (
        <Box>
          <Text dimColor>
            {tf('No memories in store {storeId}. Use /memory-stores create-memory {storeId} <content> to add one.', {
              storeId,
            })}
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Memories in {storeId} ({count})', { storeId, count: memories.length })}</Text>
        </Box>
        {memories.map(mem => (
          <Box key={mem.memory_id} flexDirection="column" marginBottom={1}>
            <Text bold>{mem.memory_id}</Text>
            <Text dimColor>{mem.content.length > 80 ? `${mem.content.slice(0, 80)}…` : mem.content}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (props.mode === 'memory-detail') {
    const { memory } = props;
    const createdAt = memory.created_at ? new Date(memory.created_at).toLocaleString() : '—';
    const updatedAt = memory.updated_at ? new Date(memory.updated_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Memory: {id}', { id: memory.memory_id })}</Text>
        </Box>
        <Text>{tf('Store: {storeId}', { storeId: memory.memory_store_id })}</Text>
        <Text>{tf('Content: {content}', { content: memory.content })}</Text>
        <Text dimColor>{tf('Created: {createdAt}', { createdAt })}</Text>
        <Text dimColor>{tf('Updated: {updatedAt}', { updatedAt })}</Text>
      </Box>
    );
  }

  if (props.mode === 'memory-created') {
    const { memory } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Memory created')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: memory.memory_id })}</Text>
        <Text>{tf('Store: {storeId}', { storeId: memory.memory_store_id })}</Text>
        <Text dimColor>{tf('Content: {content}', { content: memory.content })}</Text>
      </Box>
    );
  }

  if (props.mode === 'memory-updated') {
    const { memory } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Memory updated')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: memory.memory_id })}</Text>
        <Text dimColor>{tf('Content: {content}', { content: memory.content })}</Text>
      </Box>
    );
  }

  if (props.mode === 'memory-deleted') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>
          {tf('Memory {memoryId} deleted from store {storeId}.', { memoryId: props.memoryId, storeId: props.storeId })}
        </Text>
      </Box>
    );
  }

  if (props.mode === 'versions') {
    const { storeId, versions } = props;
    if (versions.length === 0) {
      return (
        <Box>
          <Text dimColor>{tf('No memory versions found for store {storeId}.', { storeId })}</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Memory Versions in {storeId} ({count})', { storeId, count: versions.length })}</Text>
        </Box>
        {versions.map(ver => {
          const createdAt = ver.created_at ? new Date(ver.created_at).toLocaleString() : '—';
          const isRedacted = !!ver.redacted_at;
          return (
            <Box key={ver.version_id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold>{ver.version_id}</Text>
                {isRedacted ? (
                  <>
                    <Text dimColor> · </Text>
                    <Text color={'warning' as keyof Theme}>{t('redacted')}</Text>
                  </>
                ) : null}
              </Box>
              <Text dimColor>{tf('Created: {createdAt}', { createdAt })}</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (props.mode === 'redacted') {
    const { version } = props;
    const redactedAt = version.redacted_at ? new Date(version.redacted_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'warning' as keyof Theme}>
            {t('Version redacted')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: version.version_id })}</Text>
        <Text dimColor>{tf('Redacted at: {redactedAt}', { redactedAt })}</Text>
      </Box>
    );
  }

  // error mode
  return (
    <Box>
      <Text color={'error' as keyof Theme}>{props.message}</Text>
    </Box>
  );
}
