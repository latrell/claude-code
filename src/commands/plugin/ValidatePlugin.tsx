import figures from 'figures';
import * as React from 'react';
import { useEffect } from 'react';
import { Box, Text } from '@anthropic/ink';
import { errorMessage } from '../../utils/errors.js';
import { logError } from '../../utils/log.js';
import { validateManifest } from '../../utils/plugins/validatePlugin.js';
import { t, tf } from '../../i18n/t.js';
import { plural } from '../../utils/stringUtils.js';

type Props = {
  onComplete: (result?: string) => void;
  path?: string;
};

export function ValidatePlugin({ onComplete, path }: Props): React.ReactNode {
  useEffect(() => {
    async function runValidation() {
      // If no path provided, show usage
      if (!path) {
        onComplete(
          t('Usage: /plugin validate <path>\n\n') +
            t('Validate a plugin or marketplace manifest file or directory.\n\n') +
            t('Examples:\n') +
            t('  /plugin validate .claude-plugin/plugin.json\n') +
            t('  /plugin validate /path/to/plugin-directory\n') +
            t('  /plugin validate .\n\n') +
            t('When given a directory, automatically validates .claude-plugin/marketplace.json\n') +
            t('or .claude-plugin/plugin.json (prefers marketplace if both exist).\n\n') +
            t('Or from the command line:\n') +
            t('  claude plugin validate <path>'),
        );
        return;
      }

      try {
        const result = await validateManifest(path);

        let output = '';

        // Add header
        output += tf('Validating {fileType} manifest: {filePath}\n\n', {
          fileType: result.fileType,
          filePath: result.filePath,
        });

        // Show errors
        if (result.errors.length > 0) {
          output += `${figures.cross} ${tf('Found {count} {word}:', { count: result.errors.length, word: plural(result.errors.length, 'error') })}\n\n`;

          result.errors.forEach(error => {
            output += `  ${figures.pointer} ${error.path}: ${error.message}\n`;
          });

          output += '\n';
        }

        // Show warnings
        if (result.warnings.length > 0) {
          output += `${figures.warning} ${tf('Found {count} {word}:', { count: result.warnings.length, word: plural(result.warnings.length, 'warning') })}\n\n`;

          result.warnings.forEach(warning => {
            output += `  ${figures.pointer} ${warning.path}: ${warning.message}\n`;
          });

          output += '\n';
        }

        // Show success or failure
        if (result.success) {
          if (result.warnings.length > 0) {
            output += `${figures.tick} ${t('Validation passed with warnings')}\n`;
          } else {
            output += `${figures.tick} ${t('Validation passed')}\n`;
          }

          // Exit with code 0 (success)
          process.exitCode = 0;
        } else {
          output += `${figures.cross} ${t('Validation failed')}\n`;

          // Exit with code 1 (validation failure)
          process.exitCode = 1;
        }

        onComplete(output);
      } catch (error) {
        // Exit with code 2 (unexpected error)
        process.exitCode = 2;

        logError(error);

        onComplete(
          `${figures.cross} ${tf('Unexpected error during validation: {error}', { error: errorMessage(error) })}`,
        );
      }
    }

    void runValidation();
  }, [onComplete, path]);

  return (
    <Box flexDirection="column">
      <Text>{t('Running validation...')}</Text>
    </Box>
  );
}
