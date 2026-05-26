# 微信读书 Windows 桌面应用设计

> 日期: 2026-05-22
> 基于: https://github.com/jqknono/weread-challenge-selenium
> 技术栈: Electron + selenium-webdriver + 现有 Node.js 代码

## 目标

将 weread-challenge-selenium（CLI 工具）改造为 Windows 桌面应用，提供可视化操作、实时状态监控、使用统计和多用户管理。

## 技术选型

- **框架**: Electron — 现有 Node.js 代码可直接复用，Selenium WebDriver 无需移植
- **构建工具**: electron-builder — 打包 Windows 安装包
- **UI**: 原生 HTML/CSS + 轻量图表库 — 不设前端框架，保持简单

## 应用架构

### 进程模型

```
主进程 (main)
├── 窗口管理
│   ├── 悬浮状态栏 (Frameless, 始终置顶, 药丸形 ~350x40px)
│   ├── 设置窗口 (标准 Electron 窗口)
│   └── 统计面板 (独立窗口, 从悬浮栏点击弹出)
├── 托盘图标 (右键菜单: 启动/暂停/退出)
└── 会话管理
    ├── UserManager — 多用户配置管理
    └── SessionManager — 单用户会话生命周期
        └── BrowserPool — 隐藏的 Selenium BrowserView
```

### 系统分层

| 层级 | 组件 | 职责 |
|------|------|------|
| UI 层 | 悬浮栏/设置/统计窗口 | 展示状态，接收用户操作 |
| 会话管理层 | UserManager / SessionManager | 用户切换、会话启动/停止 |
| 阅读引擎层 | WeReadAutomation | 封装 weread-challenge.js 核心逻辑 |
| 基础设施 | Selenium WebDriver / Electron / Node.js | 浏览器自动化 |

### 数据流

```
Selenium 浏览器 → 页面事件(翻页/时长) → WeReadAutomation
  → session.update → SessionManager → IPC → UI 实时渲染
```

## 窗口设计

### 悬浮状态栏

- 无边框药丸形窗口，始终置顶，尺寸约 350x40px
- 左侧: 绿色状态点 + 当前阅读时长
- 中间: 目标进度条
- 右侧: 用户切换下拉 + 操作按钮(暂停/设置/统计)
- 点击时长区域: 弹出统计面板

### 设置窗口

- 标准 Electron 窗口，分标签页:
  - **基础设置**: 浏览器选择、阅读时长、选书方式
  - **用户管理**: 添加/删除/切换用户
  - **通知配置**: 邮件、Bark 推送
  - **定时任务**: 自动启动/停止时间

### 统计面板

- 独立窗口，点击悬浮栏时长区域弹出
- 内容:
  - 当前轮次进度 (X/300 小时, X/29 天)
  - 近 7/30 天阅读时长柱状图
  - 累计阅读天数、总时长
  - 每轮花费估算

### 托盘菜单

- 右键托盘图标显示:
  - 启动阅读 / 暂停阅读
  - 显示设置
  - 退出

## 用户管理

### 多用户模型

- 单实例运行，同一时间只有一个用户在阅读
- 用户数据隔离: 每个用户独立的 `.weread/{username}/` 目录存储 cookies
- 切换用户时: 停止当前会话 → 加载目标用户 cookies → 启动新会话

### 用户配置

```json
{
  "users": [
    {
      "id": "weread-default",
      "name": "默认用户",
      "dataDir": ".weread/weread-default",
      "duration": 68,
      "browser": "chrome",
      "selection": 2
    }
  ]
}
```

## 使用统计

### 数据存储

- 本地 JSON 文件: `.weread/stats/{userId}/daily.json`
- 每日一条记录: 日期、阅读时长(分钟)、阅读页数、书籍数量

### 统计指标

| 指标 | 计算方式 |
|------|----------|
| 今日时长 | 当天累计阅读分钟数 |
| 本轮天数 | 本轮打卡已过的天数 |
| 本轮时长 | 本轮累计阅读小时数 |
| 打卡进度 | 本轮天数 / 29 天 |
| 时长进度 | 本轮时长 / 300 小时 |
| 累计天数 | 历史总有效阅读天数 |
| 累计时长 | 历史总阅读小时数 |

## 核心功能复用

### 现有代码处理

- 将 `src/weread-challenge.js` 封装为 `WeReadAutomation` 模块
- 环境变量改为配置对象传递
- 日志输出重定向到 IPC，供 UI 展示
- 登录二维码: 由终端打印改为 Electron 窗口内展示（BrowserView 中直接加载 weread.qq.com）

### 新增功能

- UI 层所有窗口和交互
- 会话管理层
- 统计面板和图表
- 托盘菜单
- 用户配置持久化

## 安全考虑

- Cookies 存储在本机，不上传
- 不在代码中硬编码任何凭据
- Electron 关闭 nodeIntegration（渲染进程），通过 preload 脚本暴露必要 API

## 项目结构

```
weread-desktop/
├── package.json
├── electron-builder.yml
├── main/
│   ├── index.js              # Electron 主进程入口
│   ├── windows/
│   │   ├── statusBar.js      # 悬浮状态栏窗口
│   │   ├── settings.js       # 设置窗口
│   │   └── stats.js          # 统计面板窗口
│   ├── services/
│   │   ├── wereadAutomation.js  # 封装原有阅读逻辑
│   │   ├── userManager.js    # 用户配置管理
│   │   ├── sessionManager.js # 会话生命周期
│   │   └── tray.js           # 托盘菜单
│   └── ipc/
│       └── handlers.js       # IPC 通信处理
├── preload/
│   └── index.js              # preload 脚本
└── renderer/
    ├── statusBar.html        # 悬浮栏 UI
    ├── settings.html         # 设置页 UI
    └── stats.html            # 统计面板 UI
```
