上游：C:\Users\lanxi\Desktop\vscode
测试数据：C:\Users\lanxi\Desktop\293K

总原则：
- 写代码前先找上游同类实现：优先 `C:\Users\lanxi\Desktop\vscode`，最后看本项目相邻模块。
- 对照上游时至少看四件事：文件放在哪里，类/函数怎么命名，状态怎么流动，CSS 怎么承接 UI 状态。
- 如果上游已有同类模式，本项目按上游写；不要发明第二套命名、目录、生命周期或服务模式。
- 代码优先短、直、朴素。只有真实跨边界、真实复用、真实复杂度出现时才加抽象。

协作互补：
- 用户改动通常更贴近真实运行环境、测试数据和具体故障现场；先尊重这些场景判断，不要轻易用抽象规范覆盖掉已经验证过的问题定位。
- Codex 负责补齐长期维护视角：落点是否符合上游边界，命名是否贴近同类模块，状态和副作用是否有唯一 owner，UI/CSS/i18n/日志/测试是否按项目规则收口。
- 评审用户代码时不要只挑风格问题；先识别其解决的真实场景和保留价值，再指出需要整理的层级、边界、可维护性问题。
- 基于用户方案继续写代码时，优先做小步整理和规范化，不推翻重写；只有发现边界错误、状态 owner 冲突或长期维护风险明确时，才调整结构。

PowerShell 规则：
- 读写中文文本文件时显式指定 `-Encoding UTF8`。
- 文件路径优先使用 `-LiteralPath`，路径字符串用单引号包裹；需要拼接路径时优先用 `Join-Path`。
- 不把 Bash 语法直接搬到 PowerShell；避免 heredoc、`&&`、`||`、`$(...)`、反斜杠续行等容易混淆的写法。
- 递归删除或移动前，先解析并核对目标绝对路径确实位于预期工作区内。

功能落地流程：
- 不要从“找个文件开始写”进入新功能；先明确功能从哪里来、经过哪些边界、到哪里结束，再决定改哪些文件。
- 写代码前先回答五件事：谁触发，谁拥有状态，谁执行副作用，谁消费结果，生命周期在哪里释放。
- 触发入口包括 command、action、menu、keybinding、按钮、启动流程、后台 contribution、IPC 消息、文件变化等；入口只做参数校验和调度，不承载大段业务逻辑。
- 状态 owner 必须唯一：view 只拥有展示和输入状态，model/state 拥有领域状态，controller 串联一次用户动作，service 编排副作用和跨边界能力，contribution 负责注册和生命周期。
- 推荐落地顺序：先找上游同类模块，再定 `common` 协议/类型/常量，再定 owner 和运行环境实现，再接 command/contribution/IPC/menu 等入口，最后写 view 和 CSS。
- 一次改动碰到多条链路时，先拆清责任。例如 context menu 是 workbench service 到 Electron 菜单 IPC 的链路，lifecycle 是 workbench/contribution 生命周期链路，runtime cleanup 是 shared-process/node 副作用链路；不要把不同链路塞进同一个局部 patch。
- 发现自己准备新增新目录、新 service、新 IPC channel、新 contribution 或新公共文件时，先确认上游是否已有同类落点和命名；没有明确理由，不自造第二套路径。

运行环境和目录：
- 新代码优先按上游运行环境组织：`common` 放纯类型、纯算法、协议、常量；`browser` 放 DOM、CSS、workbench UI、浏览器侧 service/client；`electron-main` 放 Electron 主进程能力、窗口、原生对话框、主进程 IPC；`node` 放 fs/path/process/zip 等 Node 能力；`worker` 放隔离计算。
- 不能把 Electron 主进程能力放进 `browser`，不能让 `common` 依赖 DOM、Electron、Node fs/path、workbench UI。
- 跨运行环境时先拆 `common` 协议，再分别落到 `browser` client/service、`electron-main` handler/service、`node` 能力或 `worker` 计算。
- IPC 相关代码按边界拆：通道名、请求/响应类型放 `common`；主进程 handler 放 `electron-main`；渲染进程 client/service 放 `browser`。
- 文件系统、外部进程、原生能力不要从 UI 直接调用；UI 通过 `browser` service/controller 调用，再跨到 `electron-main` 或 `node`。
- workbench 业务能力优先放在 `src/cs/workbench/contrib/<feature>/common|browser|electron-main|node|worker`；跨 workbench 复用但仍属 workbench 层的 service 放 `src/cs/workbench/services/<name>/...`；真正平台级、无业务语义的能力才考虑 `src/cs/platform/...`。
- `src/cs/base` 不放业务 service；base 只放底层工具、通用 UI 基础件和无业务语义的基础设施。

命名：
- 命名优先短、准、贴近上游；如果上游叫 `model`、`view`、`service`、`entry`、`item`，本项目不要发明更长的复合词。
- 处在业务目录内时，名字不要重复业务前缀。例如 `deviceAnalysis` 目录里不要再写 `DeviceAnalysisDataView`、`deviceAnalysisState`，优先写 `DataView`、`dataState`、`selectionModel`。
- 类名写架构角色：`DataView`、`DataModel`、`ImportController`、`SelectionService`、`PreviewPane`。不要写含糊的 `Manager`、`Helper`、`Util`、`Common`，除非上游对应模块就是这么命名。
- workbench UI 命名沿用上游角色名，例如 `View`、`Views`、`Viewlet`、`ViewPane`、`Pane`、`Widget`；不要自造长期 `Container` 这类角色名，除非上游同类 API 明确要求。
- 函数名写动作和结果：`parseCsvRows`、`createPreviewModel`、`resolveColumnMapping`、`renderEmptyState`。不要写 `handleData`、`doImport`、`processResult`。
- 布尔值必须能直接读成判断句：`hasHeaderRow`、`isPreviewVisible`、`canImport`、`shouldReuseSession`。不要写 `flag`、`status`、`isData`、`check`。
- 类型名不要加无意义后缀：优先 `ColumnMapping`、`ImportSession`，避免 `ColumnMappingType`、`ImportSessionInfoData`。
- 不把路径、业务、状态、技术实现都塞进一个名字里；不要写 `DeviceAnalysisRuntimeCleanupLifecycleIpcService` 这类长串。

代码简化和风格：
- 默认写最小可读实现。能用一个清楚分支解决的，不拆三层对象、三层函数、三种类型。
- 不为了“看起来架构完整”提前加 service、controller、resolver、options、状态机或抽象层。
- 不为了避免一行判断而创建包装函数；只有判断被复用、含义重要或主流程明显变清楚时才提炼。
- 不把简单顺序流程改成配置表、映射表、策略对象或链式管道；上游同类代码如果是直接 `if` / `switch` / early return，就跟着写直接。
- TypeScript 保持上游式克制：公共边界、事件 payload、DTO、持久化结构和复杂返回值写显式类型；局部简单变量交给推导。
- 主流程先写成功路径，再处理例外路径；能提前返回就提前返回，避免把核心逻辑包进多层 `if`。
- 三个以上条件组合时，提炼成有名字的判断函数或中间状态；不要在 `if` 里堆布尔表达式。
- 避免长函数。超过 50 行先检查能否按“读取输入、计算模型、应用结果”拆出有名字的小函数。
- 注释只解释原因、约束和非显然决策，不复述代码；临时注释、调试注释、TODO 必须带明确后续动作或 issue/上下文。
- 不写花哨链式调用压缩行数；可读的中间变量优先，但中间变量必须有领域含义。
- 代码里不混中文标识符；用户可见文案可以中文，但变量、函数、类型、class、文件名使用英文。

文件拆分和导入：
- 一个文件只保留一个主要角色。视图、状态模型、数据转换、服务调用、CSS 类名拼装不要堆在同一个文件里。
- UI 文件负责 DOM 结构、事件绑定和调用模型；数据计算放到 `*Model`、`*State`、`*Parser`、`*Resolver`；副作用和外部依赖放到 `*Service`、`*Controller` 或已有上游式服务里。
- 当一个文件超过 300 行，或出现 3 组以上互不相关的私有方法，新增逻辑不要继续塞进去；先在同目录拆出一个有明确角色的小文件。
- 不为了一次调用创建 `utils.ts`、`helper.ts`、`common.ts`。如果逻辑只服务当前模块，用领域名建文件，例如 `columnMapping.ts`、`previewModel.ts`、`importSession.ts`。
- 公共文件必须真的被至少两个以上模块复用；否则留在业务目录内，不提前上提到 base/common。
- 项目内导入优先从 `src/` 开始写完整路径，例如 `src/cs/base/browser/ui/Button/Button`，不要写多层 `../../../`。
- import 按来源分组并保持稳定：外部/平台基础模块在前，项目内 `src/` 导入随后，CSS 导入最后；删除无用 import，不保留“以后可能用”的导入。
- 导出尽量少：文件默认只导出真正跨文件使用的类、函数、类型；内部 helper 不导出，不为了测试或方便调用扩大 API 面。
- 依赖方向保持单向：base 不依赖 workbench 业务，通用模块不依赖具体业务目录，数据模型不依赖 DOM。

UI 和 CSS：
- base UI 组件的 TypeScript 只负责 DOM 结构、交互语义、ARIA、状态 class 和必要的尺寸 token；视觉表现写在同目录 CSS 中，业务场景需要特殊尺寸或外观时由调用方传局部 class 覆盖。DOM 只表达语义和交互，状态通过 class、`data-*` 或 ARIA 传给 CSS，不要为了状态样式复制两套 DOM。
- 新增或触碰 `src/cs/base/browser/ui` 代码时，不再引入全局 class 拼接工具（例如 `src/utils/cx`）；固定 class 直接写，少量可选 class 用三元拼接，多条件 class 用局部 `classNames` 数组 `push` 后 `join(' ')`。
- UI 状态 class 优先用 `classList.add/remove/toggle`，或用 `data-*`、ARIA 属性交给 CSS 承接；不要为了条件 class 新增全局 helper。
- 接入 workbench pane 时，外层遵守上游 `ViewPane` 语义；业务内部结构不要和 pane 概念混名，也不要改外层语义来迁就内部滚动、分栏或折叠。
- 不为了画线、背景、角标、间距额外加空元素；优先用 CSS 伪元素、属性选择器和已有基础组件。
- 按钮、输入、列表、树、菜单等基础交互优先找 `src/cs/base/browser/ui` 或上游已有组件；不要在业务模块里手写一套相似控件。
- CSS class 命名按组件局部语义写，例如 `.preview-row`、`.column-header`、`.empty-state`；不要把全局业务前缀重复塞进每个 class。
- 不写 inline style，除非值来自运行时测量或用户输入，且 CSS 无法表达；动态视觉状态优先用 class、`data-*`、ARIA 属性。
- CSS 不写过深结构选择器；超过三层的选择器先检查 DOM 或 class 命名是否需要调整。
- 不用 JS 拼接颜色、边距、边框、阴影等纯视觉值；JS 只传状态，CSS 决定表现。

可访问性：
- 新增按钮、输入、列表、树、菜单、tab、toolbar 时，优先使用上游已有基础组件；手写 DOM 时必须补齐 role、ARIA、label、disabled/selected/expanded 状态和键盘行为。
- focus 管理按上游模式写：打开面板、切换列表、关闭弹窗、执行命令后焦点要有明确落点；不要让焦点丢到 body。
- 可点击元素必须是 button 或带完整键盘语义的控件；不要用 div/span 伪装按钮。
- 错误、空状态、加载状态要能被读屏识别；视觉状态变化同时更新相应 ARIA 或文本状态。

生命周期、事件和状态流：
- 有事件监听、DOM listener、定时器、worker、watcher、model binding、store subscription，就必须进入上游式生命周期管理；优先使用 `DisposableStore`、`MutableDisposable`、`toDisposable` 或现有同层模式。
- UI 类持有的资源在构造或 render 阶段注册到本类 store；临时生命周期用局部 `DisposableStore`，切换输入、切换模型、重新渲染列表前先 `clear()`。
- 不允许裸写 `addEventListener`、`setInterval`、worker message handler 后没有对应释放逻辑。
- 异步任务返回后必须检查 owner 是否还有效；不要让过期请求回写已经销毁或已经切换上下文的 UI/model。
- view 不直接改 model 内部字段；通过明确方法表达意图，例如 `setSelection(...)`、`updatePreview(...)`、`resetSession(...)`。
- 事件命名使用上游习惯：`onDidChangeSelection`、`onDidUpdatePreview`、`onDidDispose`、`onWillRunImport`。不要写 `onChange`、`callback`、`dataChanged`。
- 事件 payload 用小而明确的类型；不要把整个大对象丢出去让监听方猜字段。
- 一个状态只能有一个写入入口；多个地方要改同一状态时，先收敛成 model/controller 方法。

Service、IPC 和依赖注入：
- 新能力优先按上游 service 模式接入：定义 service interface/identifier，按运行环境提供实现，通过构造函数注入使用。
- 跨模块能力、外部副作用、状态协调、缓存、IPC client、worker client、文件/进程能力优先落成 service；view/controller 调 service，不直接碰底层实现。
- service interface 放在调用方和实现方都能接受的边界处；纯协议和类型可放 `common`，browser 侧实现放 `browser`，主进程实现放 `electron-main`，Node 能力实现放 `node`。
- 同一个能力跨进程时按三段放置：`common` 写 `IxxxService`、channel 名、DTO 和协议类型；`electron-main` 写 channel handler 或主进程 service；`browser` 写 client service、workbench 侧注册和 UI 调用入口。
- service 注册文件跟实现放在同一运行环境目录内，不把 browser 注册和 electron-main 注册混在同一个文件里。
- service 命名跟随上游：`IImportService`、`IPreviewService`、`ISelectionService`；具体实现按环境命名，例如 `BrowserImportService`、`ElectronMainImportService`。
- service 方法表达领域动作，不暴露实现细节。例如 `createPreview(...)`、`resolveMapping(...)`、`runImport(...)`，不要暴露 `sendIpc(...)`、`readJsonFile(...)` 给 UI 层。
- 不把 service 当垃圾桶。纯计算不要塞进 service；先放 parser/resolver/model，service 只负责编排副作用、生命周期和跨边界调用。
- 测试或局部替换时依赖 interface，不让调用方知道具体实现类；不要在调用点判断当前是 browser/electron-main/node 再选择实现。

Contribution、Command、Context Key、Configuration：
- 新功能入口优先找上游同层 contribution、registry、command、action、menu、keybinding 接入方式；不要在应用启动主流程或已有 view 构造函数里硬编码初始化。
- workbench contrib 新功能必须有明确入口层：注册 command、action、menu、keybinding、view、context key、workbench contribution 的代码放在对应运行环境的 `<feature>.contribution.ts`，例如 `browser/settings.contribution.ts`；不要把注册入口散落到 view、container、service 或页面入口文件。
- 需要随 workbench 启动注册的能力优先写成 contribution。contribution 是 workbench 入口层：负责注册、监听生命周期和协调 service，不承载大量业务逻辑，也不是 UI 容器实现；feature 被 workbench 发现、启动或挂载时，通过同 feature 的 `.contribution.ts` 接入。
- feature 按功能域收拢，并按 `common`、`browser`、`electron-main`、`node`、`worker` 分层；workbench 入口放对应运行环境的 `.contribution.ts`，不要用 `views/` 这类横向目录收纳多个业务 feature。
- 命令 id、action id、view id、context key 名称集中定义在靠近功能的 `common` 或同层 constants 文件；不要把字符串 id 散落在 view、service、CSS 和测试里。
- UI 按钮、菜单项、快捷键触发同一个 command/action；不要按钮一套逻辑、菜单一套逻辑、快捷键再写一套逻辑。
- menu、keybinding、command palette 的注册放在 browser/workbench 侧对应注册文件中；electron-main 不注册 UI 命令。
- command handler 负责参数校验和调用 service/controller；复杂业务流程不要直接写在 handler 里。
- 命令启用、菜单显隐、工具栏状态、视图上下文优先使用 context key 或同层已有 when/context 机制；不要在多个 UI 组件里重复写 `if` 判断。
- context key 只表达 UI/命令条件，不承载大对象和业务数据；复杂状态仍然放 model/service。
- 用户可配置行为、实验开关、默认参数、阈值不要散落成普通常量；优先走项目现有 configuration service 或上游同层配置机制。
- 配置变化需要生效时，订阅 configuration change event，并纳入 disposable 管理；业务逻辑接收已解析配置值，不把 configuration service 传进纯 parser/resolver。

类型、错误、日志和文案：
- 不新增 `any`。必须接未知输入时用 `unknown`，先做收窄，再进入领域逻辑。
- 领域状态优先用明确类型或 discriminated union，不用多个 nullable 字段组合状态。
- 字符串字面量状态集中成类型或 const，不在多个文件散落 `'loading'`、`'ready'`、`'failed'`。
- 类型放在离使用处最近的位置；只有跨文件共享时才导出，不创建全局大杂烩 `types.ts`。
- DTO、持久化结构、UI model 分开命名和转换；不要让后端/文件结构直接穿透到 UI。
- 底层 service 负责记录技术错误和上下文，controller/view 决定是否展示用户通知；service/model/parser 不直接弹 UI。
- 用户可见错误要面向用户任务，日志保留技术细节；不要把 stack、IPC channel、文件系统内部路径直接展示给用户。
- 不吞异常，不空 `catch`。如果确实忽略错误，必须写清楚原因，并限制在最小范围。
- 用户可见文案统一使用 `src/cs/nls` 的 `localize(...)`，不要新增第二套 i18n/service 封装。最终用户字符串由 UI 或入口层生成；common/model/parser/node/electron-main 优先返回结构化状态、错误码和必要参数，不直接组织最终用户文案。
- 本项目 `localize` 使用命名变量格式，例如 `localize('rowsImported', 'Imported {count} rows.', { count })`，不要写 VS Code `{0}` 风格占位。

安全和性能：
- 路径和 URI 处理使用项目已有 URI/path/file service；不要手写字符串拼接路径，不把 Windows 路径分隔符写死进业务逻辑。
- 外部输入、导入文件、IPC payload、worker message 先校验和收窄，再进入领域逻辑。
- 不把任意用户输入直接传给命令执行、文件写入、worker 或 IPC；必须经过白名单、路径归一化或协议校验。
- 日志和错误消息不要泄漏敏感路径、原始数据内容或大文件片段，除非用户明确需要且处于本地调试上下文。
- 大数据、大表格、大列表不要一次性同步渲染全部 DOM；优先使用虚拟列表、分页、增量渲染或上游同类列表组件。
- 不在 render、constructor、事件同步回调里解析大文件、做重计算、跑压缩或阻塞 UI；重任务放 service、worker 或后台流程。
- 高频事件要节流、合并或基于 model diff 更新；不要每次输入、滚动、选择都全量重建视图。
- 缓存必须有 owner、失效条件和释放路径；不要在模块顶层放永久 Map 缓存业务数据。

测试和收口：
- 单元测试按上游 VS Code 测试逻辑写：测试靠近被测模块，按运行环境放在模块内 `test/common`、`test/browser`、`test/node`、`test/electron-main`，或沿用相邻同目录测试模式；不要集中堆到仓库根 `test`。
- 仓库根 `test` 只放测试基础设施和跨应用测试，例如 `test/unit` runner、`test/integration`、`test/smoke`、`test/automation`；普通 feature 单测不要放到这里。
- 新增测试文件扩展名跟被测代码和 runner 的编译链路走：TS 源码测试优先 `*.test.ts`；直接由 Node/Electron 执行的 runner、glue code 或脚本用 `.js`；
- 普通 feature 单测按被测对象命名，例如 `templateApplyProcessing.test.ts`、`fileNameMatching.test.ts`；不要在 feature 的 unit test 目录里新增 `*Smoke.test.ts`、`smoke*.test.ts` 这类文件名。
- 真正的 smoke test 按上游独立 smoke runner 体系落在仓库根 `test/smoke` 等测试基础设施目录，不混进 `src/cs/workbench/contrib/<feature>/test/<runtime>` 的普通单测里。
- 新增单测后，确认能被 `test/unit/node/index.js` 从 `out-test/src` 的 `*.test.js` 编译产物收集到；不要再维护手写测试清单。
- 新增单元测试使用 Mocha TDD 风格：`suite(...)` / `test(...)`，断言使用 Node `assert`；不要引入 Jest/Vitest，也不要自造第二套测试 DSL。
- 测试优先覆盖纯计算、解析、推断、model 状态转换和边界协议；service/controller 只测关键编排分支，UI 测试只覆盖用户动作后的可见结果和状态变化。
- parser、resolver、model、状态转换、导入映射这类复杂逻辑优先下沉成可单测的纯函数；测试覆盖输入输出和关键边界，不依赖私有实现细节。
- 有 `DisposableStore`、listener、model binding、timer、worker、watcher 的测试必须验证生命周期释放；按上游习惯优先使用 `ensureNoDisposablesAreLeakedInTestSuite()` 或同层已有测试生命周期工具。
- 如果暂时没写测试，最终说明必须明确未测原因和人工验证方式。
- 新增代码必须通过项目现有 formatter/lint 风格；不要用局部格式化把整文件无关代码刷一遍。
- 改到旧文件时，至少顺手清掉触碰范围内的死代码、重复类型、无用 import、临时注释和明显多余的业务前缀。
- 不借小功能做大搬家；重命名、拆文件、迁移旧 UI 结构这类改动必须限制在当前需求直接触碰的范围内。
- 如果发现现有代码明显偏离上游，先让新增代码按正确方式落地，再把相邻旧代码小步迁过去。

禁止清单：
- 不新增 `utils.ts`、`helper.ts`、`common.ts` 作为垃圾桶文件。
- 不新增空泛命名：`Manager`、`Helper`、`Common`、`DataInfo`、`DataItem`、`handleData`、`processData`，除非上游同类代码已有明确先例。
- 不在 view 文件里写 CSV/JSON/表格解析器、缓存策略、worker 协议和持久化逻辑。
- 不用 `any`、空 `catch`、无释放 listener、重复业务前缀、为样式添加无语义 DOM。
- 不为了通过编译把类型断言一路写到底；先修类型边界。
- 不为了“更通用”覆盖上游朴素写法；简化和抽象冲突时，优先上游同类模块的直接写法。
- 尺寸单位使用 `px`；不要引入 `rem` 一类尺寸体系。
- `localize(...)` 的 source string 默认使用英文，不直接写中文 source string。
