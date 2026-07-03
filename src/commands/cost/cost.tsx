import { StatsPanel } from '../../components/StatsPanel.js';
import type { LocalJSXCommandCall } from '../../types/command.js';

/**
 * /cost — show session-level API usage statistics.
 *
 * Displays total cost, token breakdown, duration, code changes,
 * and per-model usage. Works for both API and subscription users.
 */
export const call: LocalJSXCommandCall = async onDone => {
  return <StatsPanel onClose={onDone} />;
};
