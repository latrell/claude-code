import React, { useEffect, useState } from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { Box, Link, Text, useInput } from '@anthropic/ink';
import {
  type AccountSettings,
  calculateShouldShowGrove,
  type GroveConfig,
  getGroveNoticeConfig,
  getGroveSettings,
  markGroveNoticeViewed,
  updateGroveSettings,
} from '../../services/api/grove.js';
import { Select } from '../CustomSelect/index.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { t, tf } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';

export type GroveDecision = 'accept_opt_in' | 'accept_opt_out' | 'defer' | 'escape' | 'skip_rendering';

type Props = {
  showIfAlreadyViewed: boolean;
  location: 'settings' | 'policy_update_modal' | 'onboarding';
  onDone(decision: GroveDecision): void;
};

const NEW_TERMS_ASCII = ` _____________
 |          \\  \\
 | NEW TERMS \\__\\
 |              |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |              |
 |______________|`;

function GracePeriodContentBody(): React.ReactNode {
  return (
    <>
      <Text>
        <T>An update to our Consumer Terms and Privacy Policy will take effect on </T>
        <Text bold>October 8, 2025</Text>
        <T>. You can accept the updated terms today.</T>
      </Text>

      <Box flexDirection="column">
        <Text>
          <T>What&apos;s changing?</T>
        </Text>

        <Box paddingLeft={1}>
          <Text>
            <Text>· </Text>
            <Text bold>
              <T>You can help improve Claude</T>
            </Text>
            <Text>
              <Text>
                {t(
                  ' — Allow the use of your chats and coding sessions to train and improve Anthropic AI models. Change anytime in your Privacy Settings (',
                )}
              </Text>
              <Link url={'https://claude.ai/settings/data-privacy-controls'}></Link>
              <Text>{t(').')}</Text>
            </Text>
          </Text>
        </Box>
        <Box paddingLeft={1}>
          <Text>
            <Text>· </Text>
            <Text bold>
              <T>Updates to data retention</T>
            </Text>
            <Text>
              {t(
                ' — To help us improve our AI models and safety protections, we\u2019re extending data retention to 5 years.',
              )}
            </Text>
          </Text>
        </Box>
      </Box>

      <Text>
        <T>Learn more (</T>
        <Link url={'https://www.anthropic.com/news/updates-to-our-consumer-terms'}></Link>
        <T>) or read the updated Consumer Terms (</T>
        <Link url={'https://anthropic.com/legal/terms'}></Link>
        <T>) and Privacy Policy (</T>
        <Link url={'https://anthropic.com/legal/privacy'}></Link>
        <T>)</T>
      </Text>
    </>
  );
}

function PostGracePeriodContentBody(): React.ReactNode {
  return (
    <>
      <Text>
        <T>We&apos;ve updated our Consumer Terms and Privacy Policy.</T>
      </Text>

      <Box flexDirection="column" gap={1}>
        <Text>
          <T>What&apos;s changing?</T>
        </Text>

        <Box flexDirection="column">
          <Text bold>
            <T>Help improve Claude</T>
          </Text>
          <Text>
            <T>
              Allow the use of your chats and coding sessions to train and improve Anthropic AI models. You can change
              this anytime in Privacy Settings
            </T>
          </Text>
          <Link url={'https://claude.ai/settings/data-privacy-controls'}></Link>
        </Box>

        <Box flexDirection="column">
          <Text bold>
            <T>How this affects data retention</T>
          </Text>
          <Text>
            <T>
              Turning ON the improve Claude setting extends data retention from 30 days to 5 years. Turning it OFF keeps
              the default 30-day data retention. Delete data anytime.
            </T>
          </Text>
        </Box>
      </Box>

      <Text>
        <T>Learn more (</T>
        <Link url={'https://www.anthropic.com/news/updates-to-our-consumer-terms'}></Link>
        <T>) or read the updated Consumer Terms (</T>
        <Link url={'https://anthropic.com/legal/terms'}></Link>
        <T>) and Privacy Policy (</T>
        <Link url={'https://anthropic.com/legal/privacy'}></Link>
        <T>)</T>
      </Text>
    </>
  );
}

export function GroveDialog({ showIfAlreadyViewed, location, onDone }: Props): React.ReactNode {
  const [shouldShowDialog, setShouldShowDialog] = useState<boolean | null>(null);
  const [groveConfig, setGroveConfig] = useState<GroveConfig | null>(null);

  useEffect(() => {
    async function checkGroveSettings() {
      const [settingsResult, configResult] = await Promise.all([getGroveSettings(), getGroveNoticeConfig()]);

      // Extract config data if successful, otherwise null
      const config = configResult.success ? configResult.data : null;
      setGroveConfig(config);

      // Determine if we should show the dialog (returns false on API failure)
      const shouldShow = calculateShouldShowGrove(settingsResult, configResult, showIfAlreadyViewed);

      setShouldShowDialog(shouldShow);
      // If we shouldn't show the dialog, immediately call onDone
      if (!shouldShow) {
        onDone('skip_rendering');
        return;
      }
      // Mark as viewed every time we show the dialog (for reminder frequency tracking)
      void markGroveNoticeViewed();
      // Log that the Grove policy dialog was shown
      logEvent('tengu_grove_policy_viewed', {
        location: location as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        dismissable: config?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }

    void checkGroveSettings();
  }, [showIfAlreadyViewed, location, onDone]);

  // Loading state
  if (shouldShowDialog === null) {
    return null;
  }

  // User has already set preferences, don't show dialog
  if (!shouldShowDialog) {
    return null;
  }

  async function onChange(value: 'accept_opt_in' | 'accept_opt_out' | 'defer' | 'escape') {
    switch (value) {
      case 'accept_opt_in': {
        await updateGroveSettings(true);
        logEvent('tengu_grove_policy_submitted', {
          state: true,
          dismissable:
            groveConfig?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
        break;
      }
      case 'accept_opt_out': {
        await updateGroveSettings(false);
        logEvent('tengu_grove_policy_submitted', {
          state: false,
          dismissable:
            groveConfig?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
        break;
      }
      case 'defer':
        logEvent('tengu_grove_policy_dismissed', {
          state: true,
        });
        break;
      case 'escape':
        logEvent('tengu_grove_policy_escaped', {});
        break;
    }

    onDone(value);
  }

  const acceptOptions = groveConfig?.domain_excluded
    ? [
        {
          label: t('Accept terms · Help improve Claude: OFF (for emails with your domain)'),
          value: 'accept_opt_out',
        },
      ]
    : [
        {
          label: t('Accept terms · Help improve Claude: ON'),
          value: 'accept_opt_in',
        },
        {
          label: t('Accept terms · Help improve Claude: OFF'),
          value: 'accept_opt_out',
        },
      ];

  function handleCancel(): void {
    if (groveConfig?.notice_is_grace_period) {
      void onChange('defer');
      return;
    }
    void onChange('escape');
  }

  return (
    <Dialog
      title={t('Updates to Consumer Terms and Policies')}
      color="professionalBlue"
      onCancel={handleCancel}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>{tf('Press {key} again to exit', { key: exitState.keyName })}</Text>
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        )
      }
    >
      <Box flexDirection="row">
        <Box flexDirection="column" gap={1} flexGrow={1}>
          {groveConfig?.notice_is_grace_period ? <GracePeriodContentBody /> : <PostGracePeriodContentBody />}
        </Box>
        <Box flexShrink={0}>
          <Text color="professionalBlue">{NEW_TERMS_ASCII}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>
            <T>Please select how you&apos;d like to continue</T>
          </Text>
          <Text>
            <T>Your choice takes effect immediately upon confirmation.</T>
          </Text>
        </Box>

        <Select
          options={[
            ...acceptOptions,
            // Only show "Not now" if in grace period
            ...(groveConfig?.notice_is_grace_period ? [{ label: t('Not now'), value: 'defer' }] : []),
          ]}
          onChange={value => onChange(value as 'accept_opt_in' | 'accept_opt_out' | 'defer')}
          onCancel={handleCancel}
        />
      </Box>
    </Dialog>
  );
}

type PrivacySettingsDialogProps = {
  settings: AccountSettings;
  domainExcluded?: boolean;
  onDone(): void;
};

export function PrivacySettingsDialog({
  settings,
  domainExcluded,
  onDone,
}: PrivacySettingsDialogProps): React.ReactNode {
  const [groveEnabled, setGroveEnabled] = useState(settings.grove_enabled);

  React.useEffect(() => {
    logEvent('tengu_grove_privacy_settings_viewed', {});
  }, []);

  useInput(async (input, key) => {
    // Toggle the setting when enter/tab/space is pressed
    if (!domainExcluded && (key.tab || key.return || input === ' ')) {
      const newValue = !groveEnabled;
      setGroveEnabled(newValue);
      await updateGroveSettings(newValue);
    }
  });

  let valueComponent = <Text color="error">false</Text>;
  if (domainExcluded) {
    valueComponent = <Text color="error">{t('false (for emails with your domain)')}</Text>;
  } else if (groveEnabled) {
    valueComponent = <Text color="success">true</Text>;
  }

  return (
    <Dialog
      title={t('Data Privacy')}
      color="professionalBlue"
      onCancel={onDone}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>{tf('Press {key} again to exit', { key: exitState.keyName })}</Text>
        ) : domainExcluded ? (
          <KeyboardShortcutHint shortcut="Esc" action="cancel" />
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter/Tab/Space" action="toggle" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        )
      }
    >
      <Text>
        <T>Review and manage your privacy settings at</T>{' '}
        <Link url={'https://claude.ai/settings/data-privacy-controls'}></Link>
      </Text>

      <Box>
        <Box width={44}>
          <Text bold>
            <T>Help improve Claude</T>
          </Text>
        </Box>
        <Box>{valueComponent}</Box>
      </Box>
    </Dialog>
  );
}
