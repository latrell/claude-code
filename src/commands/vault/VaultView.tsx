import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { Credential, Vault } from './vaultsApi.js';
import { t, tf } from '../../i18n/t.js';

type Props =
  | { mode: 'list'; vaults: Vault[] }
  | { mode: 'detail'; vault: Vault }
  | { mode: 'created'; vault: Vault }
  | { mode: 'archived'; vault: Vault }
  | { mode: 'credential-list'; vaultId: string; credentials: Credential[] }
  | { mode: 'credential-added'; vaultId: string; credentialId: string }
  | { mode: 'credential-archived'; vaultId: string; credentialId: string }
  | { mode: 'error'; message: string };

function VaultRow({ vault }: { vault: Vault }): React.ReactNode {
  const isArchived = !!vault.archived_at;
  const createdAt = vault.created_at ? new Date(vault.created_at).toLocaleString() : '—';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{vault.vault_id}</Text>
        <Text dimColor> · </Text>
        <Text color={(isArchived ? 'warning' : 'success') as keyof Theme}>
          {isArchived ? t('archived') : t('active')}
        </Text>
      </Box>
      <Text>{tf('Name: {name}', { name: vault.name })}</Text>
      <Text dimColor>{tf('Created: {createdAt}', { createdAt })}</Text>
    </Box>
  );
}

export function VaultView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.vaults.length === 0) {
      return (
        <Box>
          <Text dimColor>{t('No vaults found. Use /vault create <name> to create one.')}</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Vaults ({count})', { count: props.vaults.length })}</Text>
        </Box>
        {props.vaults.map(vault => (
          <VaultRow key={vault.vault_id} vault={vault} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'detail') {
    const { vault } = props;
    const isArchived = !!vault.archived_at;
    const createdAt = vault.created_at ? new Date(vault.created_at).toLocaleString() : '—';
    const archivedAt = vault.archived_at ? new Date(vault.archived_at).toLocaleString() : null;
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Vault: {id}', { id: vault.vault_id })}</Text>
        </Box>
        <Text>{tf('Name: {name}', { name: vault.name })}</Text>
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
    const { vault } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Vault created')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: vault.vault_id })}</Text>
        <Text>{tf('Name: {name}', { name: vault.name })}</Text>
      </Box>
    );
  }

  if (props.mode === 'archived') {
    const { vault } = props;
    const archivedAt = vault.archived_at ? new Date(vault.archived_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'warning' as keyof Theme}>
            {t('Vault archived')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: vault.vault_id })}</Text>
        <Text dimColor>{tf('Archived at: {archivedAt}', { archivedAt })}</Text>
      </Box>
    );
  }

  if (props.mode === 'credential-list') {
    const { vaultId, credentials } = props;
    if (credentials.length === 0) {
      return (
        <Box>
          <Text dimColor>
            {tf('No credentials in vault {vaultId}. Use /vault add-credential {vaultId} <key> <value> to add one.', {
              vaultId,
            })}
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Credentials in {vaultId} ({count})', { vaultId, count: credentials.length })}</Text>
        </Box>
        {credentials.map(cred => {
          const isArchived = !!cred.archived_at;
          return (
            <Box key={cred.credential_id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold>{cred.credential_id}</Text>
                <Text dimColor> · </Text>
                {cred.kind ? <Text dimColor>{cred.kind}</Text> : null}
                {isArchived ? (
                  <>
                    <Text dimColor> · </Text>
                    <Text color={'warning' as keyof Theme}>{t('archived')}</Text>
                  </>
                ) : null}
              </Box>
              {/* SECURITY: credential value is never displayed */}
              <Text dimColor>{t('Value: ***mask***')}</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (props.mode === 'credential-added') {
    const { vaultId, credentialId } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Credential added')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: credentialId })}</Text>
        <Text>{tf('Vault: {vaultId}', { vaultId })}</Text>
        {/* SECURITY: credential value is never echoed back */}
        <Text dimColor>{t('Value: ***mask***')}</Text>
      </Box>
    );
  }

  if (props.mode === 'credential-archived') {
    const { vaultId, credentialId } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'warning' as keyof Theme}>
            {t('Credential archived')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: credentialId })}</Text>
        <Text>{tf('Vault: {vaultId}', { vaultId })}</Text>
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
