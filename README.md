# pi-author

基于 LLM Agent 的 SillyTavern 角色卡创作助手。

## 功能

- **对话式创作**: 通过自然语言对话引导 LLM 创建和完善角色卡
- **实时预览**: 边聊边看，卡片内容实时更新
- **智能工具调用**: Agent 可自动添加/修改/删除 Lorebook entries
- **分类管理**: 支持世界观、角色、规则、文风等多种 entry 分类
- **导入导出**: 支持 JSON 和 PNG 格式的角色卡导入导出

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                    Client (React)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ChatPanel │  │CardPreview│  │ SettingsDialog   │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                      │                               │
│               useWebSocket / useCardState            │
└──────────────────────│──────────────────────────────┘
                       │ WebSocket
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Server (Express)                    │
│  ┌──────────────────────────────────────────────┐   │
│  │              AgentLoop                        │   │
│  │  ┌────────────┐  ┌────────────────────────┐  │   │
│  │  │ SystemPrompt│  │ Tool Execution        │  │   │
│  │  └────────────┘  └────────────────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
│                      │                               │
│              ┌───────┴───────┐                       │
│              │   CardState   │                       │
│              └───────────────┘                       │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
              ┌───────────────┐
              │  LLM Provider  │
              │ (OpenAI API)   │
              └───────────────┘
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

启动后访问 http://localhost:5173

### 构建

```bash
npm run build
```

## 配置

首次使用需在「设置」中配置 LLM:

- **Provider**: 支持 OpenAI、Anthropic、Google 及兼容 API
- **API Key**: 你的 API 密钥
- **Base URL**: (可选) 自定义 API 端点
- **Model**: (可选) 指定模型名称

## Agent 工具

Agent 可调用以下工具操作角色卡:

| 工具名 | 功能 |
|--------|------|
| `update_card_meta` | 更新卡片元信息 (名称、tags、creator 等) |
| `add_entry` | 添加 Lorebook entry |
| `update_entry` | 修改已有 entry |
| `delete_entry` | 删除 entry |
| `list_entries` | 列出所有 entries |
| `set_first_mes` | 设置开场白 |
| `add_alternate_greeting` | 添加备选开场白 |

## Entry 分类

| 分类 | 前缀 | 用途 |
|------|------|------|
| 世界观 | `[世界观]` | 故事背景、世界观设定 |
| 角色 | `[角色]` | 角色人设、性格特征 |
| {{user}} | `[{{user}}]` | 用户角色相关设定 |
| 规则 | `[规则]` | 交互规则、限制条件 |
| 文风 | `[文风]` | 写作风格指导 |
| 界面 | `[界面]` | UI 相关指令 |
| 事件 | `[事件]` | 可触发的剧情事件 |

## 项目结构

```
src/
├── client/           # React 前端
│   ├── components/   # UI 组件
│   ├── hooks/        # React hooks
│   ├── styles/       # CSS 样式
│   └── utils/        # 工具函数
├── server/           # Express 后端
│   ├── agent/        # Agent 逻辑
│   ├── card/         # 卡片状态管理
│   ├── llm/          # LLM 提供者
│   └── ws/           # WebSocket 处理
└── shared/           # 共享类型定义
```

## License

MIT
