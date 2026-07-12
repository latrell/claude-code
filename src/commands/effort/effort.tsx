import * as React from 'react';
import { EffortPanel } from '../../components/EffortPanel/EffortPanel.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { t, tf } from '../../i18n/t.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import {
  type EffortValue,
  getConnectionEffortValue,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
  getEffortValueDescription,
  isEffortLevel,
  toPersistableEffort,
} from '../../utils/effort.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

const COMMON_HELP_ARGS = ['help', '-h', '--help'];

type EffortCommandResult = {
  message: string;
  effortUpdate?: { value: EffortValue | undefined };
};

function setEffortValue(effortValue: EffortValue): EffortCommandResult {
  const persistable = toPersistableEffort(effortValue);
  if (persistable !== undefined) {
    const result = updateSettingsForSource('userSettings', {
      effortLevel: persistable,
    });
    if (result.error) {
      return {
        message: tf('Failed to set effort level: {error}', { error: result.error.message }),
      };
    }
  }
  logEvent('tengu_effort_command', {
    effort: effortValue as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });

  // Env var wins at resolveAppliedEffort time. Only flag it when it actually
  // conflicts — if env matches what the user just asked for, the outcome is
  // the same, so "Set effort to X" is true and the note is noise.
  const envOverride = getEffortEnvOverride();
  if (envOverride !== undefined && envOverride !== effortValue) {
    const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL;
    if (persistable === undefined) {
      return {
        message: tf(
          'Not applied: CLAUDE_CODE_EFFORT_LEVEL={envRaw} overrides effort this session, and {effortValue} is session-only (nothing saved)',
          { envRaw, effortValue },
        ),
        effortUpdate: { value: effortValue },
      };
    }
    return {
      message: tf('CLAUDE_CODE_EFFORT_LEVEL={envRaw} overrides this session — clear it and {effortValue} takes over', {
        envRaw,
        effortValue,
      }),
      effortUpdate: { value: effortValue },
    };
  }

  const description = t(getEffortValueDescription(effortValue));
  const suffix = persistable !== undefined ? '' : t(' (this session only)');
  return {
    message: tf('Set effort level to {effortValue}{suffix}: {description}', { effortValue, suffix, description }),
    effortUpdate: { value: effortValue },
  };
}

export function showCurrentEffort(appStateEffort: EffortValue | undefined, model: string): EffortCommandResult {
  const envOverride = getEffortEnvOverride();
  // Same merge as the API path (query.ts): env > /effort (appState) >
  // connection profile. env 'auto'/'unset' (null) suppresses all of them.
  const connectionEffort = getConnectionEffortValue();
  const effectiveValue = envOverride === null ? undefined : (envOverride ?? appStateEffort ?? connectionEffort);
  if (effectiveValue === undefined) {
    const level = getDisplayedEffortLevel(model, appStateEffort);
    return { message: tf('Effort level: auto (currently {level})', { level }) };
  }
  const description = t(getEffortValueDescription(effectiveValue));
  // Neither env nor /effort set → the value came from the active connection
  // profile. Name the source so it isn't mistaken for a /effort choice.
  if (envOverride === undefined && appStateEffort === undefined) {
    return {
      message: tf('Current effort level: {effectiveValue} (from connection profile: {description})', {
        effectiveValue,
        description,
      }),
    };
  }
  return {
    message: tf('Current effort level: {effectiveValue} ({description})', { effectiveValue, description }),
  };
}

function unsetEffortLevel(): EffortCommandResult {
  const result = updateSettingsForSource('userSettings', {
    effortLevel: undefined,
  });
  if (result.error) {
    return {
      message: tf('Failed to set effort level: {error}', { error: result.error.message }),
    };
  }
  logEvent('tengu_effort_command', {
    effort: 'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });
  // env=auto/unset (null) matches what /effort auto asks for, so only warn
  // when env is pinning a specific level that will keep overriding.
  const envOverride = getEffortEnvOverride();
  if (envOverride !== undefined && envOverride !== null) {
    const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL;
    return {
      message: tf('Cleared effort from settings, but CLAUDE_CODE_EFFORT_LEVEL={envRaw} still controls this session', {
        envRaw,
      }),
      effortUpdate: { value: undefined },
    };
  }
  return {
    message: t('Effort level set to auto'),
    effortUpdate: { value: undefined },
  };
}

export function executeEffort(args: string): EffortCommandResult {
  const normalized = args.toLowerCase();
  if (normalized === 'auto' || normalized === 'unset') {
    return unsetEffortLevel();
  }

  if (!isEffortLevel(normalized)) {
    return {
      message: tf('Invalid argument: {args}. Valid options are: low, medium, high, xhigh, max, auto', { args }),
    };
  }

  return setEffortValue(normalized);
}

function ShowCurrentEffort({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue);
  const model = useMainLoopModel();
  const { message } = showCurrentEffort(effortValue, model);
  onDone(message);
  return null;
}

function ApplyEffortAndClose({
  result,
  onDone,
}: {
  result: EffortCommandResult;
  onDone: (result: string) => void;
}): React.ReactNode {
  const setAppState = useSetAppState();
  const { effortUpdate, message } = result;
  React.useEffect(() => {
    if (effortUpdate) {
      setAppState(prev => ({
        ...prev,
        effortValue: effortUpdate.value,
      }));
    }
    onDone(message);
  }, [setAppState, effortUpdate, message, onDone]);
  return null;
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  args = args?.trim() || '';

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(
      t(
        'Usage: /effort [low|medium|high|xhigh|max|auto]\n\nEffort levels:\n- low: Quick, straightforward implementation\n- medium: Balanced approach with standard testing\n- high: Comprehensive implementation with extensive testing\n- xhigh: Extra-high reasoning for complex problems\n- max: Maximum reasoning on supported models; otherwise uses the highest supported level\n- auto: Use the default effort level for your model',
      ),
    );
    return;
  }

  if (!args || args === 'current' || args === 'status') {
    if (args === 'current' || args === 'status') {
      return <ShowCurrentEffort onDone={onDone} />;
    }
    // 完全无参 → 打开交互面板
    return <EffortPanelWrapper onDone={onDone} />;
  }

  const result = executeEffort(args);
  return <ApplyEffortAndClose result={result} onDone={onDone} />;
}

function EffortPanelWrapper({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue);
  return <EffortPanel appStateEffort={effortValue} onDone={onDone} />;
}
