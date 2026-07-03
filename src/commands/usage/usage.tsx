import { Settings } from '../../components/Settings/Settings.js';
import type { LocalJSXCommandCall } from '../../types/command.js';

/**
 * /usage — shows the subscription usage panel (Settings → Usage tab).
 *
 * For subscription plan users, this displays rate limits, utilization,
 * and ChatGPT Codex usage data. For non-subscriber / API users,
 * the Usage component shows an appropriate message.
 *
 * /cost and /stats are independent commands that show session-level
 * API usage statistics (see commands/cost/ and commands/stats/).
 */
export const call: LocalJSXCommandCall = async (onDone, context) => {
  return <Settings onClose={onDone} context={context} defaultTab="usage" />;
};
