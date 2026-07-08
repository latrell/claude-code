import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { Trigger } from './triggersApi.js';
import { t, tf } from '../../i18n/t.js';
import { cronToHuman } from '../../utils/cron.js';

type Props =
  | { mode: 'list'; triggers: Trigger[] }
  | { mode: 'detail'; trigger: Trigger }
  | { mode: 'created'; trigger: Trigger }
  | { mode: 'updated'; trigger: Trigger }
  | { mode: 'deleted'; id: string }
  | { mode: 'ran'; id: string; runId: string }
  | { mode: 'enabled'; id: string }
  | { mode: 'disabled'; id: string }
  | { mode: 'error'; message: string };

function TriggerRow({ trigger }: { trigger: Trigger }): React.ReactNode {
  const schedule = cronToHuman(trigger.cron_expression, { utc: true });
  const nextRun = trigger.next_run ? new Date(trigger.next_run).toLocaleString() : '—';
  const enabledText = trigger.enabled ? t('enabled') : t('disabled');
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{trigger.trigger_id}</Text>
        <Text dimColor> · </Text>
        <Text color={(trigger.enabled ? 'success' : 'warning') as keyof Theme}>{enabledText}</Text>
        {trigger.agent_id ? (
          <>
            <Text dimColor> · agent: </Text>
            <Text>{trigger.agent_id}</Text>
          </>
        ) : null}
      </Box>
      <Text>{tf('Schedule: {schedule}', { schedule })}</Text>
      <Text dimColor>{tf('Prompt: {prompt}', { prompt: trigger.prompt })}</Text>
      <Text dimColor>{tf('Next run: {nextRun}', { nextRun })}</Text>
    </Box>
  );
}

export function ScheduleView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.triggers.length === 0) {
      return (
        <Box>
          <Text dimColor>{t('No scheduled triggers. Use /schedule create <cron> <prompt> to create one.')}</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Scheduled Triggers ({count})', { count: props.triggers.length })}</Text>
        </Box>
        {props.triggers.map(trigger => (
          <TriggerRow key={trigger.trigger_id} trigger={trigger} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'detail') {
    const { trigger } = props;
    const schedule = cronToHuman(trigger.cron_expression, { utc: true });
    const nextRun = trigger.next_run ? new Date(trigger.next_run).toLocaleString() : '—';
    const lastRun = trigger.last_run ? new Date(trigger.last_run).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Trigger: {triggerId}', { triggerId: trigger.trigger_id })}</Text>
        </Box>
        <Text>
          {t('Status:')}{' '}
          <Text color={(trigger.enabled ? 'success' : 'warning') as keyof Theme}>
            {trigger.enabled ? t('enabled') : t('disabled')}
          </Text>
        </Text>
        <Text>{tf('Schedule: {schedule}', { schedule })}</Text>
        {trigger.agent_id ? <Text>{tf('Agent: {agentId}', { agentId: trigger.agent_id })}</Text> : null}
        <Text>{tf('Next run: {nextRun}', { nextRun })}</Text>
        <Text dimColor>{tf('Last run: {lastRun}', { lastRun })}</Text>
        <Text dimColor>{tf('Prompt: {prompt}', { prompt: trigger.prompt })}</Text>
        {trigger.created_at ? (
          <Text dimColor>
            {tf('Created: {createdAt}', { createdAt: new Date(trigger.created_at).toLocaleString() })}
          </Text>
        ) : null}
      </Box>
    );
  }

  if (props.mode === 'created') {
    const { trigger } = props;
    const schedule = cronToHuman(trigger.cron_expression, { utc: true });
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Trigger created')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: trigger.trigger_id })}</Text>
        <Text>{tf('Schedule: {schedule}', { schedule })}</Text>
        <Text>{tf('Prompt: {prompt}', { prompt: trigger.prompt })}</Text>
        {trigger.agent_id ? <Text>{tf('Agent: {agentId}', { agentId: trigger.agent_id })}</Text> : null}
        <Text dimColor>{tf('Status: {status}', { status: trigger.enabled ? t('enabled') : t('disabled') })}</Text>
      </Box>
    );
  }

  if (props.mode === 'updated') {
    const { trigger } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Trigger updated')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: trigger.trigger_id })}</Text>
        <Text dimColor>{tf('Status: {status}', { status: trigger.enabled ? t('enabled') : t('disabled') })}</Text>
      </Box>
    );
  }

  if (props.mode === 'deleted') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>{tf('Trigger {id} deleted.', { id: props.id })}</Text>
      </Box>
    );
  }

  if (props.mode === 'ran') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={'success' as keyof Theme}>{tf('Trigger {id} fired.', { id: props.id })}</Text>
        </Box>
        <Text dimColor>{tf('Run ID: {runId}', { runId: props.runId })}</Text>
      </Box>
    );
  }

  if (props.mode === 'enabled') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>{tf('Trigger {id} enabled.', { id: props.id })}</Text>
      </Box>
    );
  }

  if (props.mode === 'disabled') {
    return (
      <Box>
        <Text color={'warning' as keyof Theme}>{tf('Trigger {id} disabled.', { id: props.id })}</Text>
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
