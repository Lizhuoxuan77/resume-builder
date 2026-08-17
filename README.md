# 简历编辑器 (Resume Builder)

纯前端简历编写器：填写 → 实时预览 → 多格式导出，支持 Windows 桌面应用一键安装。

![Status](https://img.shields.io/badge/status-stable-brightgreen)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![Electron](https://img.shields.io/badge/electron-31.x-9feaf9)

## ✨ 功能特性

- **表单填写**：个人信息、教育背景、实习/工作经历、项目经验、技术特长、奖项、自我评价
- **实时预览**：左右分栏，所见即所得
- **3 套模板**：经典 / 侧边栏 / 极简，切换零延迟
- **多格式导出**：PDF / DOCX / Markdown / PNG
- **简历解析导入**：粘贴文本或上传 DOCX，自动提取字段
- **JSON 备份**：本地存档、跨设备恢复
- **快捷键**：`Ctrl+S` 保存，`Ctrl+E` 导出，`Ctrl+1/2/3` 切模板
- **响应式布局**：桌面宽屏自动分栏，窄屏折叠为单列
- **桌面应用**：Electron 打包 + NSIS 安装器，一键安装

## 🚀 快速开始

### Web 模式（开发）

```bash
npm install
npm run dev          # 同时启动 Vite (5173) + Electron
```

访问 `http://localhost:5173`。

### 仅 Web 端（纯前端预览）

```bash
npm run dev:web
```

### 仅 Electron 窗口（已有 dev server）

```bash
npm run dev:electron
```

## 📦 打包发布

```bash
npm run package      # 一键生成 NSIS 安装包
```

产物：`release-build/简历编辑器 Setup 0.1.0.exe`

用户拿到 exe 后双击安装，默认路径 `%LOCALAPPDATA%\Programs\resume-builder\`，自动创建桌面/开始菜单快捷方式。

> Windows 上首次打包可能遇到 `winCodeSign` 解压符号链接权限问题，仓库已通过 `scripts/7za-wrapper.exe`（6KB C# 程序）自动注入 `-snl-` 参数解决，`postinstall` 钩子自动部署。

## 🏗️ 架构

遵循 **SOLID 原则**，高内聚低耦合：

```
src/
├── core/           # 配置、事件总线、存储
├── models/         # 简历数据模型 + 校验
├── services/       # 导出/导入/存储/模板/校验服务
│   ├── exporters/  # PDF / DOCX / Markdown
│   └── importers/  # DOCX 解析 + 启发式文本解析
├── views/          # 视图层（编辑器/预览/导出对话框等）
├── controllers/    # 控制器（编排视图与服务）
├── templates/      # 3 套简历模板
├── styles/         # 设计 tokens + 组件样式
├── types/          # TS 类型
└── utils/          # 工具函数

electron/           # Electron 主进程 / 预加载
scripts/            # 打包脚本
public/             # 静态资源
```

### 关键设计

- **DIP**：视图通过 `EventBus` 与服务通信，不直接依赖具体实现
- **SRP**：每个服务只负责一类能力（导入 / 导出 / 校验 / 模板）
- **OCP**：新增模板只需注册到 `TemplateRegistry`
- **ISP**：服务接口按需暴露（如 `Exporter` / `Importer` 接口分离）

## 🧪 技术栈

- **TypeScript 5.4** + **Vite 5**：现代前端构建
- **原生 ES Modules**：无打包锁，运行零额外运行时
- **docx / html2canvas / mammoth**：多格式互转
- **Electron 31 + electron-builder 24**：桌面应用与 NSIS 安装包

## ⌨️ 快捷键

| 操作         | 快捷键       |
| ------------ | ------------ |
| 保存         | `Ctrl+S`     |
| 导出         | `Ctrl+E`     |
| 切模板 1/2/3 | `Ctrl+1/2/3` |
| 自动保存     | 实时         |

## 📄 导出格式

| 格式     | 用途               |
| -------- | ------------------ |
| PDF      | 求职投递、打印     |
| DOCX     | 二次编辑、ATS 解析 |
| Markdown | GitHub、技术博客   |
| PNG      | 社交分享、内嵌邮件 |

## 📝 License

MIT © 2026 lizx
