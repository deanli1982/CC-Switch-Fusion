# CC Switch Fusion — 详细规格说明

## 1. 概述

**CC Switch Fusion** 是 CC Switch 的分支增强版，核心目标是实现**跨供应商模型融合路由**（Fusion Model Routing）。它允许用户将不同 Claude 模型类型（Haiku/Sonnet/Opus/Default）分别映射到不同的 API 供应商，在无需手动切换供应商的前提下，自动将图片分析请求路由到支持多模态的供应商（如 Qwen3.6-Plus），将纯文本请求路由到低成本供应商（如 DeepSeek）。

### 1.1 版本信息
- **版本号**：3.14.1
- **基于**：CC Switch 3.14.1
- **新增功能**：Fusion Model Mapping、Auto Image → Haiku 路由、多供应商同时高亮

### 1.2 核心差异（vs 原版 CC Switch）

| 功能 | CC Switch | CC Switch Fusion |
|------|-----------|------------------|
| 当前供应商 | 全局单一 | Fusion 模式下多供应商同时活跃 |
| 模型路由 | 同一供应商内重命名 | 跨供应商路由 |
| 图片处理 | 需手动切换供应商 | 自动检测图片 → 自动路由 |
| UI 状态 | 只有一个"使用中" | Fusion 映射的供应商均显示"使用中" |

---

## 2. 功能规格

### 2.1 Fusion Model Mapping（融合模型映射）

**目标**：让每个 Claude 模型类型可以独立配置目标供应商和模型名。

**配置项**：

| 模型类型 | 匹配规则 | 用途 |
|----------|----------|------|
| Default | 不匹配 Haiku/Sonnet/Opus 关键词的模型 | 纯文本对话兜底 |
| Haiku | 模型名含 "haiku"（大小写不敏感） | 轻量快速请求 |
| Sonnet | 模型名含 "sonnet"（大小写不敏感） | 平衡型请求 |
| Opus | 模型名含 "opus"（大小写不敏感） | 复杂推理请求 |

**配置方式**：
1. Settings → Fusion（融合路由）标签页
2. 每个类型包含：
   - **目标供应商**：下拉选择已配置的供应商
   - **目标模型**：手动输入该供应商支持的模型名（如 `qwen3.6-plus`）
   - **启用/禁用开关**：控制该类型映射是否生效

**路由逻辑**：
```
Claude Code 请求 → CC Switch 代理
    │
    ├─ Fusion 未启用 → 走当前供应商（原版行为）
    │
    └─ Fusion 启用 → 提取请求模型名 → 分类
         ├─ 含 "haiku" → Haiku 映射 → 目标供应商A
         ├─ 含 "sonnet" → Sonnet 映射 → 目标供应商B
         ├─ 含 "opus" → Opus 映射 → 目标供应商C
         └─ 其他 → Default 映射 → 目标供应商D
```

### 2.2 Auto Image → Haiku 自动图片路由

**目标**：当请求中包含图片时，自动按 Haiku 类型路由，无需用户手动操作。

**实现机制**：
1. 代理层在转发前检查请求体（`messages[].content[]`）
2. 如果存在 `type: "image"` 的内容块，强制按 Haiku 类型分类
3. 按 Haiku 映射配置路由到对应供应商

**开关位置**：Settings → Fusion → 顶部总开关下方 "Auto Image → Haiku"

**适用场景**：
- 用户发送图片 + 文字 → 自动走多模态供应商
- 用户发送纯文字 → 正常按模型名分类

### 2.3 多供应商同时高亮

**目标**：Fusion 模式下，主页面所有被映射到的供应商都显示蓝色"使用中"边框，直观展示活跃的 API 通道。

**实现机制**：
1. 从 `settings.json` 读取 Fusion 映射配置
2. 提取所有被使用的 `providerId` 组成集合 `fusionProviderIds`
3. ProviderCard 组件判断 `isFusionActive = fusionProviderIds.has(provider.id)`
4. ProviderActions 组件判断 `isCurrent || isFusionActive` 来决定按钮状态（"使用中" vs "启用"）

### 2.4 代理路由服务（继承自 CC Switch）

- **本地代理**：`http://127.0.0.1:15721`（可配置端口）
- **支持应用**：Claude、Codex、Gemini
- **故障转移**：支持配置优先级队列，自动切换可用供应商
- **API 格式转换**：支持 Anthropic / OpenAI Chat / OpenAI Responses / Gemini Native 格式互转

---

## 3. 技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      CC Switch Fusion                       │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │◄──►│   Tauri IPC   │◄──►│    Rust      │  │
│  │ React 18 +   │    │   (invoke)    │    │  Backend     │  │
│  │ TypeScript   │    │               │    │              │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                 │          │
│                                          ┌──────┴───────┐  │
│                                          │   Proxy       │  │
│                                          │ (Axum HTTP)   │  │
│                                          └─────────────┘  │
│                                                 │          │
│                                    ┌────────────┼────────┐│
│                                    │   Fusion  Router     ││
│                                    │  (model_mapper.rs)   ││
│                                    └────────────────────┘│
└─────────────────────────────────────────────────┼─────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    ▼             ▼             ▼
                              DeepSeek API  Bailian API   ...其他供应商
```

### 3.2 前端架构

**技术栈**：
- React 18 + TypeScript
- Tauri v2（桌面壳）
- Vite 7（构建工具）
- Tailwind CSS + Framer Motion
- TanStack Query（数据获取）
- Lucide React（图标）

**关键组件**：

| 组件 | 路径 | 职责 |
|------|------|------|
| `App.tsx` | `src/App.tsx` | 主容器，管理 activeApp、currentView、providers 数据 |
| `AppSwitcher` | `src/components/AppSwitcher.tsx` | 顶部应用切换栏（Claude/Codex/Gemini 等） |
| `ProviderList` | `src/components/providers/ProviderList.tsx` | 供应商列表，负责 **fusionProviderIds** 集合构建 |
| `ProviderCard` | `src/components/providers/ProviderCard.tsx` | 供应商卡片，`isActiveProvider` 融合 Fusion 判断 |
| `ProviderActions` | `src/components/providers/ProviderActions.tsx` | 操作按钮组，"使用中" vs "启用" 按钮状态 |
| `FusionModelMappingPage` | `src/components/settings/FusionModelMappingPage.tsx` | Fusion 设置页面 |
| `FusionChannelBar` | `src/components/FusionChannelBar.tsx` | 主页面 Fusion 活跃通道展示栏 |

**状态管理**：
- `useSettingsQuery()` — 从 `~/.cc-switch-fusion/settings.json` 加载 Fusion 配置
- `useProvidersQuery()` — 加载供应商列表
- `useSaveSettingsMutation()` — 保存设置（auto-save）

### 3.3 后端架构（Rust）

**技术栈**：
- Rust 1.95 + Tauri v2.8
- Axum（HTTP 框架）
- rusqlite（SQLite 数据库）
- serde（JSON 序列化）

**关键模块**：

| 模块 | 路径 | 职责 |
|------|------|------|
| `fusion_router.rs` | `src-tauri/src/proxy/fusion_router.rs` | **核心**：图片检测 + 模型分类 + 供应商路由 |
| `model_mapper.rs` | `src-tauri/src/proxy/model_mapper.rs` | 模型名映射（Provider 级） |
| `handler_context.rs` | `src-tauri/src/proxy/handler_context.rs` | 请求上下文，调用 Fusion 路由 |
| `forwarder.rs` | `src-tauri/src/proxy/forwarder.rs` | 请求转发，应用 Fusion 模型名覆盖 |
| `settings.rs` | `src-tauri/src/settings.rs` | 设置管理，含 `FusionModelMapping` 结构体 |
| `config.rs` | `src-tauri/src/config.rs` | 应用配置目录管理 |

### 3.4 Fusion 路由实现细节

**核心函数**：

```rust
// 检测请求体中是否包含图片内容块
pub fn body_contains_image(body: &Value) -> bool {
    body.get("messages")
        .and_then(|m| m.as_array())
        .map(|msgs| {
            msgs.iter().any(|msg| {
                msg.get("content")
                    .and_then(|c| c.as_array())
                    .map(|blocks| {
                        blocks.iter().any(|b| {
                            b.get("type").and_then(|t| t.as_str()) == Some("image")
                        })
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

// 主路由函数
pub async fn try_fusion_route(
    db: &Arc<Database>,
    app_type_str: &str,
    fusion: &FusionModelMapping,
    request_model: &str,
    request_body: &Value,
) -> Result<Option<(Provider, String)>, AppError> {
    if !fusion.enabled {
        return Ok(None);
    }

    // 图片检测 → 强制 Haiku 路由
    let model_type = if fusion.auto_image_to_haiku && body_contains_image(request_body) {
        log::debug!("[Fusion] Detected image → Haiku routing");
        ModelType::Haiku
    } else {
        classify_model_type(request_model)
    };

    // 查找映射
    let entry = match model_type {
        ModelType::Haiku => &fusion.haiku,
        ModelType::Sonnet => &fusion.sonnet,
        ModelType::Opus => &fusion.opus,
        ModelType::Default => &fusion.default,
    };

    // 解析目标供应商
    let Some(entry) = entry else { return Ok(None); };
    let provider = db.get_provider_by_id(&entry.provider_id, app_type_str)?
        .ok_or_else(|| AppError::Config(...))?;

    Ok(Some((provider, entry.model_name.clone())))
}
```

**调用链**：
```
handle_messages() [handler.rs]
    │
    ▼
RequestContext::new() [handler_context.rs]
    │
    ├─ extract request_model from body
    │
    ▼
try_fusion_route() [fusion_router.rs]
    │
    ├─ body_contains_image(body) → image detected?
    ├─ classify_model_type(model) → keyword matching
    ├─ 查找 FusionMappingEntry
    │
    ▼
返回 (Provider, model_name) 或 None
    │
    ▼
RequestContext::create_forwarder()
    │
    ▼
RequestForwarder::forward() [forwarder.rs]
    │
    ├─ 使用 fusion 返回的 Provider（目标供应商）
    ├─ 使用 fusion 返回的 model_name（覆盖 body.model）
    │
    ▼
HTTP 请求 → 目标供应商 API
```

### 3.5 数据存储

**配置文件位置**：`~/.cc-switch-fusion/`

| 文件 | 内容 |
|------|------|
| `settings.json` | 应用设置 + Fusion 映射配置 |
| `cc-switch-fusion.db` | SQLite 数据库（供应商、MCP、会话等） |
| `skills/` | 统一 Skill 存储目录 |

**Fusion 配置结构**（settings.json 中）：
```json
{
  "fusionModelMapping": {
    "enabled": true,
    "autoImageToHaiku": true,
    "haiku": {
      "providerId": "0d20cbe7-29e9-4fa0-8a72-a741be6e3d76",
      "modelName": "qwen3.6-plus"
    },
    "sonnet": {
      "providerId": "b3c459b8-ae60-4411-9b7b-18dbfdd2c06b",
      "modelName": "deepseek-v4-pro[1m]"
    },
    "opus": {
      "providerId": "b3c459b8-ae60-4411-9b7b-18dbfdd2c06b",
      "modelName": "deepseek-v4-pro[1m]"
    },
    "default": {
      "providerId": "b3c459b8-ae60-4411-9b7b-18dbfdd2c06b",
      "modelName": "deepseek-v4-pro[1m]"
    }
  }
}
```

### 3.6 Claude Code 集成

Claude Code 需配置使用 CC Switch Fusion 代理：

```json
// ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:15721",
    "ANTHROPIC_AUTH_TOKEN": "PROXY_MANAGED"
  }
}
```

**工作流程**：
1. Claude Code 发送请求到 `127.0.0.1:15721`
2. CC Switch 代理接收 → Fusion 路由 → 选择目标供应商
3. 请求转发到目标供应商 API
4. 响应返回给 Claude Code

---

## 4. 实现思路详解

### 4.1 跨供应商路由的设计决策

**为什么不在 Proxy 层做跨供应商路由？**
- 原有架构中，Proxy 先通过 `ProviderRouter::select_providers()` 选择单个供应商
- Fusion 路由在 `RequestContext::new()` 中执行，**先于** Provider 选择
- 当 Fusion 命中时，直接返回目标 Provider，跳过 `select_providers()`
- 这样既不影响故障转移逻辑（Fusion 命中时不需要故障转移），又保持了代码的清晰分离

### 4.2 图片检测的粒度选择

**为什么检测 `messages[].content[]` 中的 `type: "image"`？**
- Anthropic API 的图片内容使用 `type: "image"` 块表示
- 这是 Anthropic Messages API 的标准格式
- 检测时机：在代理收到请求后、转发前检查 JSON body
- 开销：仅一次 JSON 遍历，性能影响可忽略

### 4.3 多供应商高亮的实现策略

**为什么不修改数据库？**
- "使用中" 是一个纯展示概念，不需要持久化
- Fusion 模式下，所有被映射的供应商都视为"活跃"
- 通过前端 `fusionProviderIds` 集合判断，零数据库开销

**按钮状态逻辑**：
```tsx
// ProviderActions.tsx
if (isCurrent || isFusionActive) {
    return { text: "使用中", disabled: true };
}
return { text: "启用", disabled: false };
```

### 4.4 配置持久化

**为什么使用 auto-save 而不是手动保存？**
- Fusion 映射配置修改频繁，自动保存减少用户操作
- Settings 页面使用 `handleAutoSave` → `useSaveSettingsMutation`
- 每次修改立即写入 `~/.cc-switch-fusion/settings.json`
- 代理层从磁盘读取（`settings.rs::get_settings()`），配置即时生效

---

## 5. 构建与部署

### 5.1 编译要求

| 依赖 | 版本 |
|------|------|
| Rust | 1.95.0 |
| Node.js | 24.x |
| pnpm | 11.x |
| MSVC Build Tools | Visual Studio 2022 |
| Windows SDK | 10.0.18362 |

### 5.2 构建命令

```bash
# 前端类型检查
npx tsc --noEmit

# 完整构建（exe + MSI + NSIS）
npx tauri build

# 产物位置
# src-tauri/target/release/cc-switch-fusion.exe
# src-tauri/target/release/bundle/msi/CC Switch Fusion_3.14.1_x64_en-US.msi
# src-tauri/target/release/bundle/nsis/CC Switch Fusion_3.14.1_x64-setup.exe
```

### 5.3 版本命名规范

- 版本号沿用父项目 CC Switch 版本（3.14.1）
- 产品名称：`CC Switch Fusion`
- 窗口标题：`CC Switch Fusion`
- 应用标识：`com.ccswitch.fusion.desktop`
- 配置目录：`~/.cc-switch-fusion/`
- 可执行文件：`cc-switch-fusion.exe`

---

## 6. 测试策略

### 6.1 单元测试

**Rust 测试**（`fusion_router.rs`）：
- `body_contains_image` — 检测含图片/纯文本/字符串 content
- `classify_model_type` — 大小写不敏感匹配
- 序列化/反序列化测试

### 6.2 集成测试

| 测试场景 | 预期结果 |
|----------|----------|
| Fusion 关闭 → 发送请求 | 走当前供应商 |
| Fusion 开启 + 图片 → 请求 | 走 Haiku 映射的供应商 |
| Fusion 开启 + 纯文本 → 请求 | 按模型名走对应映射 |
| Haiku 映射为空 → 图片请求 | 走当前供应商 |
| 多供应商映射 → UI 显示 | 所有映射供应商显示"使用中" |

---

## 7. 已知限制

1. **Claude Desktop 3P 不支持 Fusion** — 仅 Claude CLI 支持
2. **图片路由仅适用于 Anthropic 格式** — 对 Codex/Gemini 暂不支持
3. **故障转移与 Fusion 互斥** — Fusion 命中时不走故障转移队列
4. **代理必须运行** — Fusion 路由依赖 CC Switch 代理服务

---

## 8. 文件清单

**新增/修改的核心文件**：

| 文件 | 状态 | 说明 |
|------|------|------|
| `src-tauri/src/proxy/fusion_router.rs` | 新增 | Fusion 路由核心模块 |
| `src-tauri/src/proxy/handler_context.rs` | 修改 | 集成 Fusion 路由到请求上下文 |
| `src-tauri/src/proxy/forwarder.rs` | 修改 | 应用 Fusion 模型名覆盖 |
| `src-tauri/src/settings.rs` | 修改 | 添加 FusionModelMapping 结构体 |
| `src/types.ts` | 修改 | 前端类型定义 |
| `src/components/FusionModelMappingPage.tsx` | 新增 | Fusion 设置页面 |
| `src/components/FusionChannelBar.tsx` | 新增 | 主页面通道栏 |
| `src/components/providers/ProviderList.tsx` | 修改 | 添加 fusionProviderIds 逻辑 |
| `src/components/providers/ProviderCard.tsx` | 修改 | isActiveProvider 融合 Fusion 判断 |
| `src/components/providers/ProviderActions.tsx` | 修改 | "使用中" 按钮逻辑 |
| `src/components/settings/SettingsPage.tsx` | 修改 | 添加 Fusion 标签页 |
| `src-tauri/tauri.windows.conf.json` | 修改 | 窗口标题改为 "CC Switch Fusion" |
| `package.json` | 修改 | 项目名称改为 "cc-switch-fusion" |
| `src-tauri/Cargo.toml` | 修改 | 包名改为 "cc-switch-fusion" |
| `SPEC.md` | 新增 | 需求文档（父目录） |
| `SPEC_FUSION.md` | 新增 | 本规格文档 |

---

*本文档最后更新：2026-05-16*
