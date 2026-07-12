import capitalize from 'lodash-es/capitalize.js';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { getChatGPTSubscriptionPlan } from '../bootstrap/state.js';
import { has1mContext, modelSupports1M } from '../utils/context.js';
import { isChatGPTAuthMode, isChatGPTCodexModelUnavailable } from '../utils/model/chatgptModels.js';
import { getAPIProvider } from '../utils/model/providers.js';
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from 'src/utils/fastMode.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  getSupportedEffortLevelsForModel,
  modelSupportsEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../utils/effort.js';
import {
  getDefaultMainLoopModel,
  getDefaultMainLoopModelSetting,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../utils/model/model.js';
import { getModelOptions } from '../utils/model/modelOptions.js';
import { getSettingsForSource, updateSettingsForSource } from '../utils/settings/settings.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { Select } from './CustomSelect/index.js';
import { Byline, KeyboardShortcutHint, Pane } from '@anthropic/ink';
import { effortLevelToSymbol } from './EffortIndicator.js';
import { T } from '../i18n/TText.js';
import { t, tf } from '../i18n/t.js';

export type Props = {
  initial: string | null;
  sessionModel?: ModelSetting;
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void;
  onCancel?: () => void;
  isStandaloneCommand?: boolean;
  showFastModeNotice?: boolean;
  /** Overrides the dim header line below "Select model". */
  headerText?: string;
  /**
   * When true, skip writing effortLevel to userSettings on selection.
   * Used by the assistant installer wizard where the model choice is
   * project-scoped (written to the assistant's .claude/settings.json via
   * install.ts) and should not leak to the user's global ~/.claude/settings.
   */
  skipSettingsWrite?: boolean;
};

const NO_PREFERENCE = '__NO_PREFERENCE__';

export function ModelPicker({
  initial,
  sessionModel,
  onSelect,
  onCancel,
  isStandaloneCommand,
  showFastModeNotice,
  headerText,
  skipSettingsWrite,
}: Props): React.ReactNode {
  const setAppState = useSetAppState();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const maxVisible = 10;

  const initialValue = initial === null ? NO_PREFERENCE : initial;
  const [focusedValue, setFocusedValue] = useState<string | undefined>(initialValue);

  const isFastMode = useAppState(s => (isFastModeEnabled() ? s.fastMode : false));

  const [marked1MValues, setMarked1MValues] = useState<Set<string>>(() => {
    if (!has1mContext(initialValue) || !optionSupports1M(initialValue)) return new Set();
    const base = initialValue.replace(/\[1m\]/i, '');
    const marks = [base];
    // A restored default1mContext preference pins the resolved default model
    // with [1m] (see resolveInitialMainLoopModelSetting). Mark the "Default"
    // entry too so the toggle state shows where the user originally set it.
    if (base === getDefaultMainLoopModelSetting().replace(/\[1m\]/i, '')) {
      marks.push(NO_PREFERENCE);
    }
    return new Set(marks);
  });

  const handleToggle1M = useCallback(() => {
    if (!focusedValue || !optionSupports1M(focusedValue)) return;
    // Key on the base value so lookups in handleSelect / is1MMarked match the
    // initializer — predefined 1M options arrive with a `[1m]` suffix in
    // `focusedValue`, which would diverge from the base-value key set.
    const baseKey = focusedValue.replace(/\[1m\]/i, '');
    setMarked1MValues(prev => {
      const next = new Set(prev);
      if (next.has(baseKey)) {
        next.delete(baseKey);
      } else {
        next.add(baseKey);
      }
      return next;
    });
  }, [focusedValue]);

  const [hasToggledEffort, setHasToggledEffort] = useState(false);
  const effortValue = useAppState(s => s.effortValue);
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined ? convertEffortValueToLevel(effortValue) : undefined,
  );

  // Memoize all derived values to prevent re-renders
  const chatGPTPlan = getChatGPTSubscriptionPlan();
  const modelOptions = useMemo(() => getModelOptions(isFastMode ?? false), [isFastMode, chatGPTPlan]);

  // Ensure the initial value is in the options list
  // This handles edge cases where the user's current model (e.g., 'haiku' for 3P users)
  // is not in the base options but should still be selectable and shown as selected
  const optionsWithInitial = useMemo(() => {
    if (
      initial !== null &&
      !modelOptions.some(opt => opt.value === initial) &&
      shouldRestoreInitialModelOption(initial, chatGPTPlan)
    ) {
      return [
        ...modelOptions,
        {
          value: initial,
          label: modelDisplayString(initial),
          description: t('Current model'),
        },
      ];
    }
    return modelOptions;
  }, [modelOptions, initial, chatGPTPlan]);

  const selectOptions = useMemo(
    () =>
      optionsWithInitial.map(opt => ({
        ...opt,
        value: opt.value === null ? NO_PREFERENCE : opt.value,
      })),
    [optionsWithInitial],
  );
  const initialFocusValue = useMemo(
    () => (selectOptions.some(_ => _.value === initialValue) ? initialValue : (selectOptions[0]?.value ?? undefined)),
    [selectOptions, initialValue],
  );
  const visibleCount = Math.min(maxVisible, selectOptions.length);
  const hiddenCount = Math.max(0, selectOptions.length - visibleCount);

  const focusedModelName = selectOptions.find(opt => opt.value === focusedValue)?.label;
  const focusedModel = resolveOptionModel(focusedValue);
  const focusedSupports1M = optionSupports1M(focusedValue);
  const is1MMarked =
    focusedSupports1M && focusedValue !== undefined && marked1MValues.has(focusedValue.replace(/\[1m\]/i, ''));
  const focusedSupportsEffort = focusedModel ? modelSupportsEffort(focusedModel) : false;
  const focusedEffortLevels = focusedModel ? getSupportedEffortLevelsForModel(focusedModel) : [];
  const focusedSupportsXhigh = focusedEffortLevels.includes('xhigh');
  const focusedSupportsMax = focusedEffortLevels.includes('max');
  const focusedDefaultEffort = getDefaultEffortLevelForOption(focusedValue);
  // Clamp display when selected effort isn't supported by the focused model.
  // resolveAppliedEffort() does the same downgrade at API-send time.
  const displayEffort =
    effort === 'max' && !focusedSupportsMax
      ? focusedSupportsXhigh
        ? 'xhigh'
        : 'high'
      : effort === 'xhigh' && !focusedSupportsXhigh
        ? 'high'
        : effort;

  const handleFocus = useCallback(
    (value: string) => {
      setFocusedValue(value);
      if (!hasToggledEffort && effortValue === undefined) {
        setEffort(getDefaultEffortLevelForOption(value));
      }
    },
    [hasToggledEffort, effortValue],
  );

  // Effort level cycling keybindings
  const handleCycleEffort = useCallback(
    (direction: 'left' | 'right') => {
      if (!focusedSupportsEffort) return;
      setEffort(prev => cycleEffortLevel(prev ?? focusedDefaultEffort, direction, focusedEffortLevels));
      setHasToggledEffort(true);
    },
    [focusedSupportsEffort, focusedEffortLevels, focusedDefaultEffort],
  );

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
      'modelPicker:toggle1M': () => handleToggle1M(),
    },
    { context: 'ModelPicker' },
  );

  function handleSelect(value: string): void {
    logEvent('tengu_model_command_menu_effort', {
      effort: effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    if (!skipSettingsWrite) {
      // Prior comes from userSettings on disk — NOT merged settings (which
      // includes project/policy layers that must not leak into the user's
      // global ~/.claude/settings.json), and NOT AppState.effortValue (which
      // includes session-ephemeral sources like --effort CLI flag).
      // See resolvePickerEffortPersistence JSDoc.
      const effortLevel = resolvePickerEffortPersistence(
        effort,
        getDefaultEffortLevelForOption(value),
        getSettingsForSource('userSettings')?.effortLevel,
        hasToggledEffort,
      );
      const persistable = toPersistableEffort(effortLevel);
      if (persistable !== undefined) {
        updateSettingsForSource('userSettings', { effortLevel: persistable });
      }
      setAppState(prev => ({ ...prev, effortValue: effortLevel }));
    }

    const selectedModel = resolveOptionModel(value);
    const selectedEffort = hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel) ? effort : undefined;
    if (value === NO_PREFERENCE) {
      // "Default" has no model string to carry a [1m] suffix (model = null,
      // resolved at runtime). When 1M is toggled on it, pin the resolved
      // default model setting with [1m] instead of passing null.
      if (marked1MValues.has(NO_PREFERENCE) && selectedModel && modelAllows1M(selectedModel)) {
        if (!skipSettingsWrite) {
          // Persist the preference so the 1M toggle on Default survives
          // restarts (restored via resolveInitialMainLoopModelSetting).
          updateSettingsForSource('userSettings', { default1mContext: true });
        }
        const baseDefault = getDefaultMainLoopModelSetting().replace(/\[1m\]/i, '');
        onSelect(`${baseDefault}[1m]`, selectedEffort);
        return;
      }
      if (!skipSettingsWrite) {
        // undefined deletes the key (updateSettingsForSource customizer).
        updateSettingsForSource('userSettings', { default1mContext: undefined });
      }
      onSelect(null, selectedEffort);
      return;
    }
    // Apply or strip [1m] suffix based on user toggle. marked1MValues is keyed
    // on the base value (see initializer + handleToggle1M), so look up with the
    // base form — not `value`, which may carry a `[1m]` suffix from predefined
    // 1M options and would never match.
    const baseValue = value.replace(/\[1m\]/i, '');
    const wants1M = marked1MValues.has(baseValue) && selectedModel !== undefined && modelAllows1M(selectedModel);
    const finalValue = wants1M ? `${baseValue}[1m]` : baseValue;
    onSelect(finalValue, selectedEffort);
  }

  const content = (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <T color="remember" bold>
            Select model
          </T>
          <Text dimColor>
            {headerText ??
              t(
                'Choose a model for this and future sessions. Use \u2190 \u2192 for effort; Space toggles 1M context when supported.',
              )}
          </Text>
          {sessionModel && (
            <Text dimColor>
              {tf('Currently using {model} for this session (set by plan mode). Selecting a model will undo this.', {
                model: modelDisplayString(sessionModel),
              })}
            </Text>
          )}
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Box flexDirection="column">
            <Select
              defaultValue={initialValue}
              defaultFocusValue={initialFocusValue}
              options={selectOptions}
              onChange={handleSelect}
              onFocus={handleFocus}
              onCancel={onCancel ?? (() => {})}
              visibleOptionCount={visibleCount}
            />
          </Box>
          {hiddenCount > 0 && (
            <Box paddingLeft={3}>
              <Text dimColor>{tf('and {count} more\u2026', { count: hiddenCount })}</Text>
            </Box>
          )}
        </Box>

        <Box marginBottom={1} flexDirection="column">
          {focusedSupportsEffort ? (
            <Text dimColor>
              <EffortLevelIndicator effort={displayEffort} />{' '}
              {tf('{level} effort', { level: capitalize(displayEffort) })}
              {displayEffort === focusedDefaultEffort ? t(' (default)') : ''}{' '}
              <Text color="subtle">{t(' \u2190 \u2192 to adjust')}</Text>
            </Text>
          ) : (
            <Text color="subtle">
              <EffortLevelIndicator effort={undefined} /> {t('Effort not supported')}
              {focusedModelName ? tf(' for {model}', { model: focusedModelName }) : ''}
            </Text>
          )}
          {focusedSupports1M ? (
            is1MMarked ? (
              <Text dimColor>
                <EffortLevelIndicator effort={'high'} /> {t('1M context on')}
                <Text color="subtle">{t(' \u00b7 Space to toggle')}</Text>
              </Text>
            ) : (
              <Text color="subtle">
                <EffortLevelIndicator effort={undefined} /> {t('1M context off')}
                {focusedModelName ? tf(' for {model}', { model: focusedModelName }) : ''}
                <Text color="subtle">{t(' \u00b7 Space to toggle')}</Text>
              </Text>
            )
          ) : null}
        </Box>

        {isFastModeEnabled() ? (
          showFastModeNotice ? (
            <Box marginBottom={1}>
              <Text dimColor>
                {tf(
                  'Fast mode is ON and available with {model} only (/fast). Switching to other models turn off fast mode.',
                  { model: FAST_MODE_MODEL_DISPLAY },
                )}
              </Text>
            </Box>
          ) : isFastModeAvailable() && !isFastModeCooldown() ? (
            <Box marginBottom={1}>
              <Text dimColor>
                {tf('Use /fast to turn on Fast mode ({model} only).', {
                  model: FAST_MODE_MODEL_DISPLAY,
                })}
              </Text>
            </Box>
          ) : null
        ) : null}
      </Box>

      {isStandaloneCommand && (
        <Text dimColor italic>
          {exitState.pending ? (
            <>{tf('Press {key} again to exit', { key: exitState.keyName })}</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action={t('confirm')} />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description={t('exit')}
              />
            </Byline>
          )}
        </Text>
      )}
    </Box>
  );

  if (!isStandaloneCommand) {
    return content;
  }

  return <Pane color="permission">{content}</Pane>;
}

function resolveOptionModel(value?: string): string | undefined {
  if (!value) return undefined;
  return value === NO_PREFERENCE ? getDefaultMainLoopModel() : parseUserSpecifiedModel(value);
}

function optionSupports1M(value?: string): boolean {
  const model = resolveOptionModel(value);
  return model !== undefined && modelAllows1M(model);
}

function modelAllows1M(model: string): boolean {
  if (getAPIProvider() === 'openai' && isChatGPTAuthMode()) {
    return modelSupports1M(model);
  }
  return true;
}

function shouldRestoreInitialModelOption(model: string, plan: string | null): boolean {
  if (getAPIProvider() !== 'openai' || !isChatGPTAuthMode()) return true;
  return !isChatGPTCodexModelUnavailable(model, plan);
}

function EffortLevelIndicator({ effort }: { effort?: EffortLevel }): React.ReactNode {
  return <Text color={effort ? 'claude' : 'subtle'}>{effortLevelToSymbol(effort ?? 'low')}</Text>;
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
  supportedLevels: readonly EffortLevel[],
): EffortLevel {
  if (supportedLevels.length === 0) return current;
  // If the current level isn't in the model's advertised choices (for example,
  // max after switching to a model that tops out at xhigh), anchor at high.
  const idx = supportedLevels.indexOf(current);
  const highIndex = supportedLevels.indexOf('high');
  const currentIndex = idx !== -1 ? idx : highIndex !== -1 ? highIndex : 0;
  if (direction === 'right') {
    return supportedLevels[(currentIndex + 1) % supportedLevels.length]!;
  } else {
    return supportedLevels[(currentIndex - 1 + supportedLevels.length) % supportedLevels.length]!;
  }
}

function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel();
  const defaultValue = getDefaultEffortForModel(resolved);
  return defaultValue !== undefined ? convertEffortValueToLevel(defaultValue) : 'high';
}
