import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { AgentTrigger } from './agentsApi.js';
import { cronToHuman } from '../../utils/cron.js';
import { t, tf } from '../../i18n/t.js';

type Props =
  | { mode: 'list'; agents: AgentTrigger[] }
  | { mode: 'created'; agent: AgentTrigger }
  | { mode: 'deleted'; id: string }
  | { mode: 'ran'; id: string; runId: string }
  | { mode: 'error'; message: string };

function AgentRow({ agent }: { agent: AgentTrigger }): React.ReactNode {
  const schedule = cronToHuman(agent.cron_expr, { utc: true });
  const nextRun = agent.next_run ? new Date(agent.next_run).toLocaleString() : '—';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{agent.id}</Text>
        <Text dimColor> · </Text>
        <Text color={'suggestion' as keyof Theme}>{agent.status}</Text>
      </Box>
      <Text>{tf('Schedule: {schedule}', { schedule })}</Text>
      <Text dimColor>{tf('Prompt: {prompt}', { prompt: agent.prompt })}</Text>
      <Text dimColor>{tf('Next run: {nextRun}', { nextRun })}</Text>
    </Box>
  );
}

export function AgentsPlatformView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.agents.length === 0) {
      return (
        <Box>
          <Text dimColor>{t('No scheduled agents. Use /agents-platform create <cron> <prompt> to create one.')}</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{tf('Scheduled Agents ({count})', { count: props.agents.length })}</Text>
        </Box>
        {props.agents.map(agent => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'created') {
    const schedule = cronToHuman(props.agent.cron_expr, { utc: true });
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            {t('Agent created')}
          </Text>
        </Box>
        <Text>{tf('ID: {id}', { id: props.agent.id })}</Text>
        <Text>{tf('Schedule: {schedule}', { schedule })}</Text>
        <Text>{tf('Prompt: {prompt}', { prompt: props.agent.prompt })}</Text>
        <Text dimColor>{tf('Status: {status}', { status: props.agent.status })}</Text>
      </Box>
    );
  }

  if (props.mode === 'deleted') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>{tf('Agent {id} deleted.', { id: props.id })}</Text>
      </Box>
    );
  }

  if (props.mode === 'ran') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={'success' as keyof Theme}>{tf('Agent {id} triggered.', { id: props.id })}</Text>
        </Box>
        <Text dimColor>{tf('Run ID: {runId}', { runId: props.runId })}</Text>
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
