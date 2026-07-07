import React, { useCallback, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { getDisplayPath } from '../utils/file.js';
import { removePathFromRepo, validateRepoAtPath } from '../utils/githubRepoPathMapping.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from '@anthropic/ink';
import { Spinner } from './Spinner.js';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';

type Props = {
  targetRepo: string;
  initialPaths: string[];
  onSelectPath: (path: string) => void;
  onCancel: () => void;
};

export function TeleportRepoMismatchDialog({
  targetRepo,
  initialPaths,
  onSelectPath,
  onCancel,
}: Props): React.ReactNode {
  const [availablePaths, setAvailablePaths] = useState<string[]>(initialPaths);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleChange = useCallback(
    async (value: string): Promise<void> => {
      if (value === 'cancel') {
        onCancel();
        return;
      }

      setValidating(true);
      setErrorMessage(null);

      const isValid = await validateRepoAtPath(value, targetRepo);

      if (isValid) {
        onSelectPath(value);
        return;
      }

      // Path is invalid - remove it from config and update state
      removePathFromRepo(targetRepo, value);
      const updatedPaths = availablePaths.filter(p => p !== value);
      setAvailablePaths(updatedPaths);
      setValidating(false);

      setErrorMessage(
        tf('{path} no longer contains the correct repository. Select another path.', { path: getDisplayPath(value) }),
      );
    },
    [targetRepo, availablePaths, onSelectPath, onCancel],
  );

  const options = [
    ...availablePaths.map(path => ({
      label: (
        <Text>
          <T>Use </T>
          <Text bold>{getDisplayPath(path)}</Text>
        </Text>
      ),
      value: path,
    })),
    { label: t('Cancel'), value: 'cancel' },
  ];

  return (
    <Dialog title={t('Teleport to Repo')} onCancel={onCancel} color="background">
      {availablePaths.length > 0 ? (
        <>
          <Box flexDirection="column" gap={1}>
            {errorMessage && <Text color="error">{errorMessage}</Text>}
            <T vars={{ targetRepo }}>Open Claude Code in {targetRepo}:</T>
          </Box>

          {validating ? (
            <Box>
              <Spinner />
              <T> Validating repository…</T>
            </Box>
          ) : (
            <Select options={options} onChange={value => void handleChange(value)} />
          )}
        </>
      ) : (
        <Box flexDirection="column" gap={1}>
          {errorMessage && <Text color="error">{errorMessage}</Text>}
          <T dimColor vars={{ targetRepo }}>
            Run claude --teleport from a checkout of {targetRepo}
          </T>
        </Box>
      )}
    </Dialog>
  );
}
