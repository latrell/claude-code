const zh: Record<string, string> = {
  // ThreadHistory
  Today: '今天',
  Yesterday: '昨天',
  'This Week': '本周',
  'Past Week': '上周',
  All: '全部',
  Unknown: '未知',
  'Just now': '刚刚',
  'Session list not supported by this agent': '此 agent 不支持会话列表',
  'Search threads...': '搜索线程...',
  'Loading threads...': '加载线程中...',
  "You don't have any past threads yet.": '您还没有历史线程。',
  'No threads match your search.': '没有匹配搜索的线程。',
  'New Thread': '新线程',
  'Session history is not supported by this agent.':
    '此 agent 不支持会话历史。',

  // ACPConnect
  'Proxy server URL': '代理服务器 URL',
  Disconnected: '已断开',
  'Connecting...': '连接中...',
  Connected: '已连接',
  Error: '错误',
  'Select from Album': '从相册选择',
  Server: '服务器',
  Connect: '连接',
  Disconnect: '断开',
  'Auth Token': '认证令牌',
  optional: '可选',
  'Working Directory': '工作目录',
  '/path/to/project': '/项目/路径',
  'For remote access': '用于远程访问',
  'or point camera at QR code': '或将相机对准二维码',

  // ChatInterface
  'Permission Request': '权限请求',
  'Tool call not found': '未找到工具调用',
  'Start conversation': '开始对话',
  'Type a message to start chatting with ACP agent':
    '输入消息开始与 ACP agent 聊天',

  // ChatInterface — Permission Mode Selector
  Default: '默认',
  'Manually approve permission requests': '手动审批权限请求',
  'Auto-accept edits': '自动接受编辑',
  'Auto-allow file edit operations': '自动允许文件编辑操作',
  'Bypass permissions': '跳过权限',
  'Skip all permission checks': '跳过所有权限检查',
  'Plan mode': '规划模式',
  'Plan only, do not execute tools': '仅规划，不执行工具',
  "Don't ask": '不询问',
  "Don't ask, auto-reject": '不弹出询问，自动拒绝',
  Auto: '自动判断',
  'AI decides whether to approve': 'AI 自动判断是否批准',

  // NewSessionDialog
  'Failed to create session': '创建会话失败',
  'New Session': '新会话',
  'Title (optional)': '标题（可选）',
  'My session': '我的会话',
  Environment: '环境',
  '-- None --': '-- 无 --',
  'no branch': '无分支',
  Cancel: '取消',
  'Creating...': '创建中...',
  Create: '创建',

  // SessionSidebar
  Sessions: '会话',
  'Session history': '历史会话',
  'No sessions yet': '暂无会话',
  Older: '更早',

  // PermissionPanel
  Allow: '允许',
  Deny: '拒绝',

  // permission-request.tsx
  'Permission Required': '需要权限',

  // MessageBubble
  Claude: 'Claude',
  'Uploaded image': '上传的图片',
  Expand: '展开',

  // ModelSelectorPicker
  'Select a model…': '选择模型…',
  'No models found.': '未找到模型。',

  // ChatInput
  'Send message to Claude...': '给 Claude 发送消息…',
  'Waiting for session...': '等待会话...',
  'Attach file': '附加文件',
  'Command list': '命令列表',
  'Enter to send, Shift+Enter for new line': 'Enter 发送，Shift+Enter 换行',
  'Attached image {n}': '已附加图片 {n}',
  'Remove image {n}': '移除图片 {n}',

  // ToolCallGroup
  '{count}x {name}': '{count}次{name}',
  '{n} tool calls': '{n} 个工具调用',
  '{n} tools: {list}': '{n} 个工具: {list}',

  // connection-status
  'Toggle theme': '切换主题',
  Light: '浅色',
  Dark: '深色',
  System: '跟随系统',

  // useTokens
  'Token is required': '令牌不能为空',

  // acp/client.ts — error messages
  'Listing sessions is not supported by this agent': '此 agent 不支持列出会话',
  'List sessions timed out': '列出会话超时',
  'Loading sessions is not supported by this agent': '此 agent 不支持加载会话',
  'Load session timed out': '加载会话超时',
  'Resuming sessions is not supported by this agent': '此 agent 不支持恢复会话',
  'Resume session timed out': '恢复会话超时',

  // FileReader errors
  'Invalid data URL: missing comma separator':
    '无效的 data URL：缺少逗号分隔符',
  'FileReader error: ': 'FileReader 错误：',
  'FileReader error': 'FileReader 错误',
}

export default zh
