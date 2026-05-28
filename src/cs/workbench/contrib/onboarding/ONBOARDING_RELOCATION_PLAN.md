# Onboarding Relocation Plan

本文档记录 `src/cs/workbench/contrib/onboarding` 的整理方案。目标不是一次性删除导览能力，而是把当前混在 onboarding 目录里的数据导入、模板联动、页面挂载和导览展示职责拆开，让后续从 React/tsx 迁移到上游式 TypeScript 组件时边界更清楚。

## 当前问题

`onboarding` 目录目前包含三类不同职责：

- 导览 UI 和高亮测量：`Onboarding.tsx`、`onboardingTypes.ts`、`onboardingSteps.ts`。
- 导览状态机和业务动作：`useOnboarding.ts`、`onboardingState.ts`、`OnboardingControllerHost.tsx`。
- 跨模块联动和懒加载胶水：`onboardingEvents.ts`、`loadOnboarding.ts`、`loadOnboardingController.ts`。

主要风险是 `useOnboarding.ts` 过重。它不仅管理 step/open/close，还直接读取 demo 文件、构造导入数据、写 session state、点击模板 DOM、派发 template 事件、切换页面。这样会让 onboarding 成为多个模块的隐式协调中心，后续改 data/template/page 任意一处都容易牵动导览逻辑。

## 目标边界

整理后，`onboarding` 目录只保留导览自己的东西：

- `Onboarding.tsx` 短期作为导览 overlay 展示层保留，后续单独迁移为 `.ts` 实现。
- `onboardingSteps.ts` 保留导览流程配置。
- `onboardingTypes.ts` 保留导览配置和高亮目标类型。
- `useOnboarding.ts` 只保留导览状态机：打开、关闭、上一步、下一步、完成、当前 step、是否允许下一步。
- `onboardingState.ts` 可保留公共状态类型和 idle state，但不继续扩张业务动作。

其他职责迁回对应模块：

- Demo 数据导入归属 data/import。
- 模板创建和模板 tab/apply 操作归属 template/data。
- 页面挂载、懒加载、controller bridge 归属 `Page` 附近。
- 跨模块事件不要放在 onboarding 目录下。

## 阶段 1：抽出 Demo 数据导入

新增一个数据侧 helper，例如：

- `src/cs/workbench/contrib/data/demoDataImport.ts`

它负责：

- 从 `desktopImport.getDeviceAnalysisDemoFiles` 读取桌面 demo 文件。
- 浏览器 fallback 到 `/demo/demo-01.csv` 等静态文件。
- 构造 `File`、`fileId`、`itemKey`、`sourceKey`、`sourcePath`。
- 返回标准化后的 raw data entries。

`useOnboarding.ts` 只调用这个 helper，并继续由调用方决定如何写入 session：

- `setRawData(nextEntries)`
- `setProcessedData([])`
- `clearPreviewState({ clearSelection: true })`
- `setSelectedPreviewFileId(nextEntries[0].fileId)`

验收点：

- `useOnboarding.ts` 不再直接引用 `buildFileIdentityKey`、`buildItemKey`、`createCsvImporterFileId`。
- demo 文件路径、desktop bridge 类型和 fallback 逻辑集中在 data/import 侧。
- 点击导览导入步骤仍能导入 demo 数据。

## 阶段 2：迁出跨模块 onboarding event

当前 `onboardingEvents.ts` 只定义：

```ts
export const ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT =
  "analysis:onboarding-create-template";
```

但它被 template 模块消费，因此不应归属 onboarding 目录。短期可以迁到：

- `src/cs/workbench/contrib/template/templateEvents.ts`

并更新引用：

- `src/cs/workbench/contrib/onboarding/useOnboarding.ts`
- `src/cs/workbench/contrib/template/useTemplateManagerState.ts`

中期建议移除 `window.dispatchEvent`，改为由 `Page` 或 data/template integration 层显式传递 `onCreateTemplate` 回调。这样 template 不需要监听全局事件，onboarding 也不需要知道 template 内部动作。

验收点：

- `src/cs/workbench/contrib/onboarding/onboardingEvents.ts` 被删除。
- template 模块不再从 deviceAnalysis/onboarding 导入任何符号。
- 行为保持一致：导览走到 template step 时仍能创建/切换模板。

## 阶段 3：收拢模板 DOM 操作

`useOnboarding.ts` 当前通过 DOM id 点击模板相关元素：

- `analysis-template-mode-tab-select`
- `analysis-template-dropdown-btn`
- `analysis-template-mode-tab-save`
- `analysis-template-output-rule-apply-to-all`

这些 id 可以继续作为导览高亮 target，但不应作为 onboarding 驱动业务行为的主要接口。建议新增 template/data 侧 action，例如：

- `openTemplateSelectMode()`
- `openTemplateSaveMode()`
- `createTemplateForOnboarding()`
- `applyTemplateToAllForOnboarding()`

短期如果不方便一次改完，可以先把 DOM 点击封装到 `src/cs/workbench/contrib/template/templateOnboardingActions.ts`，让 onboarding 只依赖一个明确的 integration helper。长期再把 helper 内部替换成真实状态/action。

验收点：

- `useOnboarding.ts` 不再散落多个 `clickElementById(...)` 调用。
- onboarding step 配置仍可使用 DOM id 做高亮和定位。
- 模板业务行为由 template/data 侧承接。

## 阶段 4：下沉懒加载和 Controller Host

`loadOnboarding.ts` 和 `loadOnboardingController.ts` 都是很薄的懒加载缓存。建议二选一：

- 合并为 `src/cs/workbench/contrib/onboarding/onboardingLoader.ts`。
- 或迁到 `Page.tsx` 附近，作为页面级加载策略。

`OnboardingControllerHost.tsx` 的职责是让 `useOnboarding` 在 lazy component 中运行，然后把状态回传给 `Page.tsx`。它更像页面 integration，而不是导览 UI 本体。中期可以迁为：

- `src/cs/workbench/contrib/onboarding/useOnboardingController.ts`
- 或 `src/cs/workbench/contrib/onboarding/onboardingControllerHost.tsx`

验收点：

- onboarding 目录不再同时承担 overlay、状态机、页面挂载桥接三层职责。
- `Page.tsx` 的懒加载边界仍然清晰，首次打开页面不会同步加载大 overlay。
- 自动导览和手动打开导览行为一致。

## 阶段 5：拆分 `Onboarding.tsx`

`Onboarding.tsx` 目前体量很大，包含：

- DOM target 解析。
- rect 测量。
- spotlight/ring 计算。
- card 定位。
- React 渲染。

短期不建议在前四个阶段里同时重写它，避免行为回归。等职责边界稳定后，再拆成：

- `onboardingGeometry.ts`：纯计算和 rect 工具。
- `onboardingTargets.ts`：DOM target 解析和 virtual target 解析。
- `Onboarding.tsx`：只保留展示和事件绑定。

后续从 React 迁移到 `.ts` 时，再把展示层替换为上游式 DOM 组件。

验收点：

- 几何计算可独立测试。
- `Onboarding.tsx` 明显变薄。
- 不新增 `index.ts` 入口文件。
- 新增导览相关代码优先 `.ts`，不继续扩张 `.tsx`。

## 推荐执行顺序

1. 先做阶段 1 和阶段 2。这两步风险低，收益高，能立刻切断 onboarding 对 data/import/template 的反向污染。
2. 再做阶段 3。这里涉及 template 行为，需要边改边手测导览流程。
3. 然后做阶段 4。它主要是组织结构优化，可以在行为稳定后进行。
4. 最后做阶段 5。大组件拆分容易引入视觉和定位回归，应单独 review。

## 执行 Checklist

### 阶段 0：改前确认

- [ ] 记录当前 `src/cs/workbench/contrib/onboarding` 文件列表。
- [ ] 用 `rg` 确认所有 onboarding 相关引用位置。
- [ ] 手动跑一遍当前 onboarding 主流程，作为行为基线。
- [ ] 确认本次改动不混入视觉重构或 React 迁移。

### 阶段 1：抽出 Demo 数据导入

- [ ] 新增 `src/cs/workbench/contrib/data/demoDataImport.ts`。
- [ ] 把 `DEMO_FILE_PATHS` 和 `DEMO_TEMPLATE_NAME_FALLBACK` 中的数据导入相关常量迁出；模板默认名是否迁出可按实际调用点判断。
- [ ] 把 `DesktopDemoFileEntry`、`ImportedDemoRawDataEntry` 等 demo 导入类型迁出。
- [ ] 把 desktop bridge 读取逻辑迁出。
- [ ] 把 `/demo/demo-*.csv` fallback 读取逻辑迁出。
- [ ] 把 `File`、`fileId`、`itemKey`、`sourceKey` 构造逻辑迁出。
- [ ] `useOnboarding.ts` 改为调用 data/import helper。
- [ ] `useOnboarding.ts` 不再导入 `buildFileIdentityKey`、`buildItemKey`、`createCsvImporterFileId`。
- [ ] 验证 import step 可以导入 demo 数据。
- [ ] 验证导入后 preview 选中第一份 demo 文件。

### 阶段 2：迁出跨模块事件

- [ ] 新增 `src/cs/workbench/contrib/template/templateEvents.ts`。
- [ ] 迁移 `ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT`。
- [ ] 更新 `useOnboarding.ts` 的导入路径。
- [ ] 更新 `useTemplateManagerState.ts` 的导入路径。
- [ ] 删除 `src/cs/workbench/contrib/onboarding/onboardingEvents.ts`。
- [ ] 用 `rg` 确认没有模块再从 `deviceAnalysis/onboarding/onboardingEvents` 导入。
- [ ] 验证 template step 仍能触发创建模板。

### 阶段 3：收拢模板 DOM 操作

- [ ] 梳理 `useOnboarding.ts` 中所有 `clickElementById(...)` 调用。
- [ ] 保留用于高亮定位的 DOM id，不把高亮配置和业务动作混在一起改。
- [ ] 新增 template/data 侧 onboarding action helper，或在现有 template state 中暴露显式 action。
- [ ] 把 template select/save/apply 行为迁到 template/data 侧。
- [ ] `useOnboarding.ts` 只调用语义化 action，不直接点击 template DOM id。
- [ ] 验证 template step 能打开选择模板 UI。
- [ ] 验证 template-custom step 能打开保存模板 UI。
- [ ] 验证 apply step 能完成 apply-to-all 并推进导览。

### 阶段 4：整理懒加载和 Controller Host

- [ ] 决定 loader 方案：合并成 `onboardingLoader.ts`，或迁到 `Page.tsx` 附近。
- [ ] 合并或迁移 `loadOnboarding.ts`。
- [ ] 合并或迁移 `loadOnboardingController.ts`。
- [ ] 更新 `Page.tsx` 中 lazy import。
- [ ] 评估 `OnboardingControllerHost.tsx` 是否迁到页面 integration 层。
- [ ] 如果迁移 host，更新所有类型引用，避免重复定义 `OnboardingControllerState`。
- [ ] 验证首次进入页面不会同步加载大 overlay。
- [ ] 验证手动打开导览仍正常 lazy load。

### 阶段 5：拆分 `Onboarding.tsx`

- [ ] 先只移动纯 helper，不改视觉行为。
- [ ] 抽出 rect/geometry 计算到 `.ts` 文件。
- [ ] 抽出 DOM target 解析到 `.ts` 文件。
- [ ] 保持 `Onboarding.tsx` 只负责 React 展示、状态订阅和事件绑定。
- [ ] 为纯计算 helper 补轻量测试，至少覆盖 clamp、shadow outset、card placement、target rect 合并。
- [ ] 手动验证 spotlight/ring/card 定位没有明显回归。
- [ ] 单独评估后续 `.tsx` 到 `.ts` 的迁移，不和本阶段混做。

### 收尾检查

- [ ] `rg "deviceAnalysis/onboarding/onboardingEvents"` 无结果。
- [ ] `rg "createCsvImporterFileId" src/cs/workbench/contrib/onboarding` 无结果。
- [ ] `rg "buildFileIdentityKey|buildItemKey" src/cs/workbench/contrib/onboarding` 无结果。
- [ ] `rg "clickElementById" src/cs/workbench/contrib/onboarding/useOnboarding.ts` 无结果，或只剩非 template 侧临时兼容调用并有 TODO。
- [ ] 没有新增 `index.ts`。
- [ ] 新增文件优先为 `.ts`。
- [ ] 项目内新增导入使用 `src/...` 完整路径。
- [ ] onboarding 目录只保留导览 UI、流程配置、类型、状态机。
- [ ] 所有导览主流程手动验证通过。

## 手动验证清单

每个阶段完成后至少验证：

- 首次进入 Device Analysis，满足条件时自动打开导览。
- 设置页手动点击打开导览。
- 导览 import step 能导入 demo 数据。
- template step 能进入模板相关 UI。
- apply step 能推进到下一步。
- analysis 相关 step 能正确切到 analysis 页并高亮。
- Origin/settings step 能切到 settings 页并滚动到目标。
- skip/finish 后 persisted settings 中 onboarding 状态符合预期。

## 注意事项

- 不要新增 `index.ts` 入口文件。
- 新代码优先 `.ts`，不要继续扩张 `.tsx`。
- 项目内导入优先使用 `src/...` 完整路径。
- 不继续引入 `deviceAnalysis` 命名前缀作为新抽象的默认前缀。
- 移动文件时分小 PR/小提交处理，避免和视觉重构、React 迁移混在一起。
