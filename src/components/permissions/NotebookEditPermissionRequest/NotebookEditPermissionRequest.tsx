import { basename } from 'path';
import React from 'react';
import type { z } from 'zod/v4';
import { Text } from '@anthropic/ink';
import { NotebookEditTool } from '@claude-code-best/builtin-tools/tools/NotebookEditTool/NotebookEditTool.js';
import { logError } from '../../../utils/log.js';
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js';
import type { PermissionRequestProps } from '../PermissionRequest.js';
import { tf } from '../../../i18n/t.js';
import { NotebookEditToolDiff } from './NotebookEditToolDiff.js';

type NotebookEditInput = z.infer<typeof NotebookEditTool.inputSchema>;

export function NotebookEditPermissionRequest(props: PermissionRequestProps): React.ReactNode {
  const parseInput = (input: unknown): NotebookEditInput => {
    const result = NotebookEditTool.inputSchema.safeParse(input);
    if (!result.success) {
      logError(new Error(`Failed to parse notebook edit input: ${result.error.message}`));
      // Return a default value to avoid crashing
      return {
        notebook_path: '',
        new_source: '',
        cell_id: '',
      } as NotebookEditInput;
    }
    return result.data;
  };

  const parsed = parseInput(props.toolUseConfirm.input);
  const { notebook_path, edit_mode, cell_type } = parsed;

  const language = cell_type === 'markdown' ? 'markdown' : 'python';

  // Split the translated template around the placeholder so the filename keeps its bold styling
  const [questionPre, questionPost] = (
    edit_mode === 'insert'
      ? tf('Do you want to insert this cell into {file}?', { file: '\0' })
      : edit_mode === 'delete'
        ? tf('Do you want to delete this cell from {file}?', { file: '\0' })
        : tf('Do you want to make this edit to {file}?', { file: '\0' })
  ).split('\0');

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      workerBadge={props.workerBadge}
      title="Edit notebook"
      question={
        <Text>
          {questionPre}
          <Text bold>{basename(notebook_path)}</Text>
          {questionPost}
        </Text>
      }
      content={
        <NotebookEditToolDiff
          notebook_path={parsed.notebook_path}
          cell_id={parsed.cell_id}
          new_source={parsed.new_source}
          cell_type={parsed.cell_type}
          edit_mode={parsed.edit_mode}
          verbose={props.verbose}
          width={props.verbose ? 120 : 80}
        />
      }
      path={notebook_path}
      completionType="tool_use_single"
      languageName={language}
      parseInput={parseInput}
    />
  );
}
