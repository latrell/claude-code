import { basename, relative } from 'path';
import React from 'react';
import { FileEditToolDiff } from 'src/components/FileEditToolDiff.js';
import { getCwd } from 'src/utils/cwd.js';
import type { z } from 'zod/v4';
import { Text } from '@anthropic/ink';
import { FileEditTool } from '@claude-code-best/builtin-tools/tools/FileEditTool/FileEditTool.js';
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js';
import {
  createSingleEditDiffConfig,
  type FileEdit,
  type IDEDiffSupport,
} from '../FilePermissionDialog/ideDiffConfig.js';
import type { PermissionRequestProps } from '../PermissionRequest.js';
import { t, tf } from '../../../i18n/t.js';

type FileEditInput = z.infer<typeof FileEditTool.inputSchema>;

const ideDiffSupport: IDEDiffSupport<FileEditInput> = {
  getConfig: (input: FileEditInput) =>
    createSingleEditDiffConfig(input.file_path, input.old_string, input.new_string, input.replace_all),
  applyChanges: (input: FileEditInput, modifiedEdits: FileEdit[]) => {
    const firstEdit = modifiedEdits[0];
    if (firstEdit) {
      return {
        ...input,
        old_string: firstEdit.old_string,
        new_string: firstEdit.new_string,
        replace_all: firstEdit.replace_all,
      };
    }
    return input;
  },
};

export function FileEditPermissionRequest(props: PermissionRequestProps): React.ReactNode {
  const parseInput = (input: unknown): FileEditInput => {
    return FileEditTool.inputSchema.parse(input);
  };

  const parsed = parseInput(props.toolUseConfirm.input);
  const { file_path, old_string, new_string, replace_all } = parsed;

  // Split the translated template around the placeholder so the filename keeps its bold styling
  const [questionPre, questionPost] = tf('Do you want to make this edit to {file}?', { file: '\0' }).split('\0');

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      workerBadge={props.workerBadge}
      title={t('Edit file')}
      subtitle={relative(getCwd(), file_path)}
      question={
        <Text>
          {questionPre}
          <Text bold>{basename(file_path)}</Text>
          {questionPost}
        </Text>
      }
      content={
        <FileEditToolDiff
          file_path={file_path}
          edits={[{ old_string, new_string, replace_all: replace_all || false }]}
        />
      }
      path={file_path}
      completionType="str_replace_single"
      parseInput={parseInput}
      ideDiffSupport={ideDiffSupport}
    />
  );
}
