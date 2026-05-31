上游1：C:\Users\lanxi\Desktop\vscode
上游2：C:\Users\lanxi\Desktop\codex
测试数据：C:\Users\lanxi\Desktop\293K

PowerShell 规则：
- 读写中文文本文件时显式指定 `-Encoding UTF8`。
- 文件路径优先使用 `-LiteralPath`，路径字符串用单引号包裹；需要拼接路径时优先用 `Join-Path`。
- 不把 Bash 语法直接搬到 PowerShell；避免 heredoc、`&&`、`||`、`$(...)`、反斜杠续行等容易混淆的写法。
- 复杂命令先拆成短命令验证；需要多步逻辑时使用清晰的 PowerShell 变量和原生命令。
- 递归删除或移动前，先解析并核对目标绝对路径确实位于预期工作区内。

前端基础 UI 规则：
- `src/cs/base/browser/ui` 下的组件按上游风格组织为“组件目录 + 同名实现文件”，不要再添加 `index.ts` 入口文件。
- 导入项目内文件时优先使用从 `src/` 开始的完整路径，例如 `src/cs/base/browser/ui/Button/Button`；不要使用多层 `../../../` 形式。
- UI 组件的样式优先跟随上游的 CSS-first 思路：结构只表达语义和必要交互，纯视觉层级、装饰、状态呈现优先放进 CSS，用类名、属性选择器、伪元素等承接。
- 不为了样式效果手写额外 DOM；确实需要 DOM 的场景必须是语义、可访问性、交互或测量布局需要。

- 新功能不要再去写tsx，直接写ts
- react要逐渐退场，我们要逐步写成上游的ts
- 不要继续塞入deviceanalysis这种命名前缀

代码审美与架构惯性：
- 写新代码前先找上游同类写法：优先在 `C:\Users\lanxi\Desktop\vscode` 里找 VS Code 原生模块，再看 `C:\Users\lanxi\Desktop\codex`。至少对照这四件事：文件放在哪里、类/函数怎么命名、状态怎么流动、CSS 怎么承接 UI 状态。
- 如果上游已有同类模式，本项目新代码按上游模式写；不要发明第二套命名、第二套目录、第二套生命周期。只有本项目已有稳定局部模式且迁移成本明显更低时，才沿用本项目局部模式。

命名怎么写：
- 处在业务目录内时，名字不要重复业务前缀。例如 `deviceAnalysis` 目录里不要再写 `DeviceAnalysisDataView`、`deviceAnalysisState`，优先写 `DataView`、`dataState`、`selectionModel`。
- 类名写架构角色：`DataView`、`DataModel`、`ImportController`、`SelectionService`、`PreviewPane`。不要写含糊的 `Manager`、`Helper`、`Util`、`Common`，除非上游对应模块就是这么命名。
- 函数名写动作和结果：`parseCsvRows`、`createPreviewModel`、`resolveColumnMapping`、`renderEmptyState`。不要写 `handleData`、`doImport`、`processResult` 这种读不出领域含义的名字。
- 布尔值必须能直接读成判断句：`hasHeaderRow`、`isPreviewVisible`、`canImport`、`shouldReuseSession`。不要写 `flag`、`status`、`isData`、`check`。
- 类型名不要加无意义后缀：优先 `ColumnMapping`、`ImportSession`，避免 `ColumnMappingType`、`ImportSessionInfoData`。

代码风格怎么写：
- 优先照同目录或上游同类文件的写法，包括 import 顺序、空行分组、类成员顺序、私有方法位置、事件字段命名和 disposable 写法；不要在同一目录里混出另一套个人风格。
- TypeScript 代码保持上游式克制：显式类型用于公共边界、事件 payload、持久化结构和复杂返回值；局部简单变量让类型推导工作。
- import 按来源分组并保持稳定：外部/平台基础模块在前，项目内 `src/` 导入随后，CSS 导入最后；删除无用 import，不保留“以后可能用”的导入。
- 导出尽量少：文件默认只导出真正跨文件使用的类、函数、类型；内部 helper 不导出，不为了测试或方便调用扩大 API 面。
- 类成员按阅读顺序组织：静态字段、readonly/事件字段、私有状态、构造函数、生命周期方法、公共方法、私有渲染/计算方法；不要把相关方法打散。
- 私有字段和私有方法使用 TypeScript `private` / `readonly` 表达约束；能 `readonly` 就不要可变。
- 函数参数超过 3 个时，优先改成有名字的 options 类型；但不要用巨大 options 对象掩盖职责混乱。
- 避免长函数。超过 50 行先检查是否能按“读取输入、计算模型、应用结果”拆出有名字的小函数。
- 注释只解释原因、约束和非显然决策，不复述代码在做什么；临时注释、调试注释、TODO 必须带明确后续动作或 issue/上下文。
- 不写花哨链式调用来压缩行数；可读的中间变量优先，但中间变量必须有领域含义。
- 不用格式技巧制造“整齐”：不要为了对齐手动填空格，不用大块 banner 注释，不写装饰性分隔线。
- 代码里不混中文标识符；用户可见文案可以中文，但变量、函数、类型、class、文件名使用英文。
- 新增代码必须通过项目现有 formatter/lint 风格；不要用局部格式化把整文件无关代码刷一遍。

文件怎么拆：
- 一个文件只保留一个主要角色。视图、状态模型、数据转换、服务调用、CSS 类名拼装不要继续堆在同一个文件里。
- UI 文件负责 DOM 结构、事件绑定和调用模型；数据计算放到 `*Model`、`*State`、`*Parser`、`*Resolver` 这类文件；副作用和外部依赖放到 `*Service`、`*Controller` 或已有上游式服务里。
- 当一个文件超过 300 行，或者出现 3 组以上互不相关的私有方法，新增逻辑不要继续塞进去；先在同目录拆出一个有明确角色的小文件。
- 不为了一次调用创建 `utils.ts`。如果逻辑只服务当前模块，用领域名建文件，例如 `columnMapping.ts`、`previewModel.ts`、`importSession.ts`。
- 公共文件必须真的被至少两个以上模块复用；否则留在业务目录内，不提前上提到 base/common。

目录按运行环境怎么放：
- 新代码优先按上游的运行环境目录组织：`common` 放纯类型、纯算法、协议、常量和不依赖运行时的代码；`browser` 放 DOM、CSS、workbench UI、浏览器侧服务和渲染进程逻辑；`electron-main` 放 Electron 主进程能力、窗口/应用生命周期、原生对话框、主进程 IPC 注册；`node` 放 Node 运行时文件系统、进程、路径、压缩等能力；`worker` 放 worker 内部执行的隔离计算。
- 不能把 Electron 主进程能力放进 `browser`，也不能让 `common` 依赖 DOM、Electron、Node fs/path、workbench UI。
- 如果一段逻辑同时被 `browser` 和 `electron-main` 用，先把纯协议/类型/计算拆到 `common`，再分别在 `browser` 和 `electron-main` 写运行环境适配层。
- IPC 相关代码按边界拆：通道名、请求/响应类型放 `common`；主进程 handler 放 `electron-main`；渲染进程 client/service 放 `browser`。
- 文件系统、外部进程、原生能力不要从 UI 直接调用；UI 通过 `browser` 侧 service/controller 调用，再跨到 `electron-main` 或 `node` 侧实现。
- 命名和目录不要用笼统的 `frontend`、`backend`、`renderer`、`main` 自造一套；除非现有同层代码已经这样组织，新增模块默认跟随上游 `common` / `browser` / `electron-main` / `node` / `worker` 方案。

流程怎么写：
- 主函数先写成功路径，再处理例外路径。能提前返回就提前返回，避免把核心逻辑包进多层 `if`。
- 三个以上条件组合时，提炼成有名字的判断函数或中间状态，例如 `canReuseCachedPreview(...)`，不要在 `if` 里堆布尔表达式。
- 不在主流程里直接写大段数据转换；转换逻辑放到独立函数，并让函数输入输出类型清楚。
- 不用临时 patch 式变量串起流程，例如 `let temp`、`let result: any`、`let finalData`。先定义领域类型，再让每一步返回明确结构。
- 错误处理要靠明确分支和可读消息，不吞异常，不用空 `catch`，不要把错误状态混进普通返回值里，除非上游同类代码就是这种约定。

UI 怎么写：
- 新 UI 不写 TSX；用上游式 TypeScript 创建和组合 DOM。
- DOM 只表达语义和交互：容器、按钮、列表、输入、状态区域。颜色、间距、边框、显示/隐藏、选中/禁用等视觉表现写进 CSS。
- 状态通过 class、`data-*` 属性、ARIA 属性传给 CSS，例如 `data-state="empty"`、`data-selected="true"`、`aria-disabled="true"`；不要为了状态样式复制两套 DOM。
- 不为了画线、背景、角标、间距额外加空元素；优先用 CSS 伪元素、属性选择器和已有基础组件。
- 按钮、输入、列表、树、菜单等基础交互优先找 `src/cs/base/browser/ui` 或上游已有组件；不要在业务模块里手写一套相似控件。

导入和依赖怎么写：
- 项目内导入优先从 `src/` 开始写完整路径，例如 `src/cs/base/browser/ui/Button/Button`，不要写多层 `../../../`。
- 依赖方向保持单向：base 不依赖 workbench 业务，通用模块不依赖具体业务目录，数据模型不依赖 DOM。
- 不引入新框架、新状态库、新装饰器风格来解决局部问题；除非上游已有且本项目已经在同层使用。

生命周期和资源释放怎么写：
- 有事件监听、DOM listener、定时器、worker、watcher、model binding、store subscription，就必须进入上游式生命周期管理；优先使用 `DisposableStore`、`MutableDisposable`、`toDisposable` 或现有同层 disposable 模式。
- UI 类持有的资源在构造或 render 阶段注册到本类 store；不要把需要释放的 listener 藏在普通 helper 函数里。
- 临时生命周期用局部 `DisposableStore`，切换输入、切换模型、重新渲染列表前先 `clear()`，组件销毁时再 `dispose()`。
- 不允许裸写 `addEventListener`、`setInterval`、worker message handler 后没有对应释放逻辑；如果上游已有封装，优先用封装。
- 异步任务返回后必须检查 owner 是否还有效；不要让过期请求回写已经销毁或已经切换上下文的 UI/model。

事件和状态流怎么写：
- 状态必须有明确 owner：view 负责展示和用户输入，model/state 负责领域状态，service/controller 负责副作用编排。
- view 不直接改 model 的内部字段；通过明确方法表达意图，例如 `setSelection(...)`、`updatePreview(...)`、`resetSession(...)`。
- 事件命名使用上游习惯：`onDidChangeSelection`、`onDidUpdatePreview`、`onDidDispose`、`onWillRunImport`。不要写 `onChange`、`callback`、`dataChanged` 这类上下文不足的名字。
- 事件 payload 用小而明确的类型；不要把整个大对象丢出去让监听方自己猜字段。
- 不继续扩大 React callback props 式写法；TypeScript UI 中优先用 `Emitter`、service event、model event 或上游同层已有机制。
- 一个状态只能有一个写入入口；如果多个地方都能改同一状态，先收敛成 model/controller 方法，再由各处调用这个方法。

服务边界怎么写：
- view 文件不直接做文件 IO、远程请求、缓存读写、worker 调度、复杂解析和持久化；这些放到 service/controller/parser/model。
- controller 负责串联一次用户动作的流程；parser/resolver/model 负责纯计算；service 负责外部依赖和副作用。
- parser/resolver 不依赖 DOM、CSS、workbench UI；能用普通 TypeScript 单独测试。
- service 不返回 UI 结构，不接收 HTMLElement；service 的输入输出使用领域类型。
- 不把业务逻辑偷塞进 base/common；只有真正跨两个以上独立模块复用、且不依赖业务语义的代码，才可以进入 base/common。

Service 和依赖注入怎么写：
- 新能力优先按上游 service 模式接入：定义 service interface/identifier，按运行环境提供实现，通过构造函数注入使用；不要在业务代码里随手 new 复杂依赖或 import 全局单例。
- 跨模块能力、外部副作用、状态协调、缓存、IPC client、worker client、文件/进程能力都应优先落成 service；view/controller 调 service，不直接碰底层实现。
- service interface 放在调用方和实现方都能接受的边界处；纯协议和类型可放 `common`，browser 侧实现放 `browser`，主进程实现放 `electron-main`，Node 能力实现放 `node`。
- service 文件位置按上游目录边界放：纯 service identifier、interface、事件类型、请求/响应类型放 `common`；浏览器/渲染进程可直接使用的 service 实现放 `browser`；Electron 主进程实现和主进程注册放 `electron-main`；只依赖 Node 运行时的实现放 `node`；worker 内部 service 或 worker host 放 `worker`。
- 同一个能力跨进程时按三段放置：`common` 写 `IxxxService`、channel 名、DTO 和协议类型；`electron-main` 写 channel handler 或主进程 service 实现；`browser` 写 client service、workbench 侧注册和 UI 调用入口。
- workbench 业务能力优先放在对应 `src/cs/workbench/contrib/<feature>/common|browser|electron-main|node|worker` 下；跨 workbench 复用但仍属于 workbench 层的 service 放 `src/cs/workbench/services/<name>/common|browser|electron-main|node`；真正平台级、无业务语义的 service 才考虑 `src/cs/platform/<name>/common|browser|electron-main|node`。
- `src/cs/base` 不放业务 service；base 只放底层工具、通用 UI 基础件和无业务语义的基础设施。
- service 注册文件跟实现放在同一运行环境目录内，不把 browser 注册和 electron-main 注册混在同一个文件里。
- service 命名跟随上游：`IImportService`、`IPreviewService`、`ISelectionService` 这种接口表达能力，具体实现按环境命名，例如 `BrowserImportService`、`ElectronMainImportService`。
- service 方法表达领域动作，不暴露实现细节。例如 `createPreview(...)`、`resolveMapping(...)`、`runImport(...)`，不要暴露 `sendIpc(...)`、`readJsonFile(...)` 给 UI 层。
- 注册和获取 service 按同层已有模式写；如果上游同类模块使用 `registerSingleton`、contribution、registry 或 descriptor，本项目同类代码也跟随，不自造 service locator。
- 不把 service 当垃圾桶。纯计算不要塞进 service；先放 parser/resolver/model，service 只负责编排副作用、生命周期和跨边界调用。
- 测试或局部替换时依赖 interface，不让调用方知道具体实现类；不要在调用点判断当前是 browser/electron-main/node 再分支选择实现。

Contribution、Registry、Command 怎么写：
- 新功能入口优先找上游同层的 contribution、registry、command、action、menu、keybinding 接入方式；不要在应用启动主流程或已有 view 构造函数里硬编码初始化。
- 需要随 workbench 启动注册的能力，优先写成 contribution，并按同层已有机制注册；contribution 只负责注册、监听生命周期和协调 service，不承载大量业务逻辑。
- 命令 id、action id、view id、context key 名称集中定义在靠近功能的 `common` 或同层 constants 文件；不要把字符串 id 散落在 view、service、CSS 和测试里。
- UI 按钮、菜单项、快捷键触发同一个 command/action；不要按钮一套逻辑、菜单一套逻辑、快捷键再写一套逻辑。
- menu、keybinding、command palette 的注册放在 browser/workbench 侧对应注册文件中；electron-main 不注册 UI 命令。
- command handler 负责参数校验和调用 service/controller；复杂业务流程不要直接写在 handler 里。
- Registry contribution 的数据结构要小而稳定；不要把运行态对象、DOM、service 实例塞进 registry。

Context Key 和状态条件怎么写：
- 命令启用、菜单显隐、工具栏状态、视图上下文优先使用 context key 或同层已有 when/context 机制；不要在多个 UI 组件里重复写 `if` 判断。
- context key 名称按领域状态命名，例如 `importPreviewVisible`、`dataSelectionActive`、`canRunImport`；不要写 `flag1`、`showButton` 这种只描述控件的名字。
- context key 的 owner 要明确，通常由 model/controller/view contribution 更新；不要让多个组件随意 set 同一个 key。
- context key 只表达 UI/命令条件，不承载大对象和业务数据；复杂状态仍然放 model/service。
- 当一个状态同时影响菜单、快捷键、按钮和空状态时，先考虑抽成 context key，而不是让每个入口各自判断。

Configuration 和实验开关怎么写：
- 用户可配置行为、实验开关、默认参数、阈值不要散落成普通常量；优先走项目现有 configuration service 或上游同层配置机制。
- 配置 key、默认值、schema、描述集中定义；读取配置通过 service/controller，不在 view 或 parser 里到处直接读。
- 配置变化需要生效时，订阅 configuration change event，并纳入 disposable 管理；不要要求重启，除非上游同类设置就是重启生效。
- 业务逻辑接收已经解析好的配置值；不要把 configuration service 传进纯 parser/resolver。
- 实验开关必须有清楚命名、默认值和删除路径；不要留下永久性的 `enableNewX` 临时分支。

日志、错误和用户通知怎么写：
- 底层 service 负责记录技术错误和上下文，controller/view 决定是否展示用户通知；service/model/parser 不直接弹 UI。
- 用户可见错误要用面向用户的消息，日志保留技术细节；不要把 stack、IPC channel、文件系统内部路径直接展示给用户。
- 可恢复错误返回明确状态或抛出领域错误；不可恢复错误要带上下文并向上交给统一处理入口。
- 不吞异常，不空 `catch`。如果确实忽略错误，必须写清楚原因，并限制在最小范围。
- 批量任务和后台任务要区分 log、progress、notification：进度走 progress 机制，最终失败再通知，细节进日志。
- 错误类型、错误码、用户消息不要散落；跨层使用的错误协议放 `common`，环境实现负责补充底层细节。

类型怎么写：
- 不新增 `any`。必须接未知输入时用 `unknown`，先做收窄，再进入领域逻辑。
- 领域状态优先用明确类型或 discriminated union，例如 `{ kind: 'empty' } | { kind: 'ready'; model: PreviewModel } | { kind: 'error'; message: string }`，不要用多个 nullable 字段组合状态。
- 函数输入输出要显式表达边界；不要透传巨型 options/context 对象，除非上游同类 API 就是这种形态。
- 字符串字面量状态要集中成类型或 const，不在多个文件散落 `'loading'`、`'ready'`、`'failed'`。
- 类型放在离使用处最近的位置；只有跨文件共享时才导出，不创建全局大杂烩 `types.ts`。
- DTO、持久化结构、UI model 分开命名和转换；不要让后端/文件结构直接穿透到 UI。

CSS 怎么写：
- class 命名按组件局部语义写，例如 `.preview-row`、`.column-header`、`.empty-state`；不要把全局业务前缀重复塞进每个 class。
- 不写 inline style，除非值来自运行时测量或用户输入，且 CSS 无法表达；动态视觉状态优先用 class、`data-*`、ARIA 属性。
- CSS 不写过深结构选择器；超过三层的选择器先检查 DOM 或 class 命名是否需要调整。
- 不用 JS 拼接颜色、边距、边框、阴影等纯视觉值；JS 只传状态，CSS 决定表现。
- 新样式先找上游同类组件的 class 组织和状态写法，再决定本项目 class 命名。

可访问性怎么写：
- 新增按钮、输入、列表、树、菜单、tab、toolbar 时，优先使用上游已有基础组件；手写 DOM 时必须补齐 role、ARIA、label、disabled/selected/expanded 状态和键盘行为。
- focus 管理按上游模式写：打开面板、切换列表、关闭弹窗、执行命令后焦点要有明确落点；不要让焦点丢到 body。
- 可点击元素必须是 button 或带完整键盘语义的控件；不要用 div/span 伪装按钮。
- 错误、空状态、加载状态要能被读屏识别；视觉状态变化同时更新相应 ARIA 或文本状态。

性能怎么写：
- 大数据、大表格、大列表不要一次性同步渲染全部 DOM；优先使用虚拟列表、分页、增量渲染或上游同类列表组件。
- 不在 render、constructor、事件同步回调里解析大文件、做重计算、跑压缩或阻塞 UI；重任务放 service、worker 或后台流程。
- 高频事件要节流、合并或基于 model diff 更新；不要每次输入、滚动、选择都全量重建视图。
- 缓存必须有 owner、失效条件和释放路径；不要在模块顶层放永久 Map 缓存业务数据。
- 性能优化不要牺牲边界：先把计算移出 UI，再决定是否 worker 化或缓存。

本地化和用户文案怎么写：
- 用户可见文案按项目现有 localize/nls 机制写；不要在 view/service/model 里散落硬编码文案。
- service/model/parser 返回错误码、状态和必要参数；最终用户文案由 UI/controller 层组织。
- 同一动作的按钮、菜单、通知、空状态文案尽量复用同一语义，不要出现多套叫法。
- 日志可以保留技术英文，用户提示要面向用户任务，不暴露内部实现名。

安全、路径和外部输入怎么写：
- 路径和 URI 处理使用项目已有 URI/path/file service；不要手写字符串拼接路径，不把 Windows 路径分隔符写死进业务逻辑。
- 外部输入、导入文件、IPC payload、worker message 先校验和收窄，再进入领域逻辑。
- 不把任意用户输入直接传给命令执行、文件写入、worker 或 IPC；必须经过白名单、路径归一化或协议校验。
- browser 侧不要直接持有或推断主进程本地路径能力；通过 service 协议请求需要的能力。
- 日志和错误消息不要泄漏敏感路径、原始数据内容或大文件片段，除非用户明确需要且处于本地调试上下文。

测试和可验证性怎么写：
- parser、resolver、model、状态转换、导入映射这类纯逻辑新增或大改时，要优先写成可单测的纯函数。
- 测试覆盖输入输出和关键边界，不测试私有实现细节；UI 测试关注用户动作后的可见结果和状态变化。
- 如果为了赶功能暂时没写测试，最终说明里必须明确未测原因和人工验证方式。
- 复杂 UI 逻辑如果不好测，先把复杂判断搬到 model/resolver，再测纯逻辑。

禁止清单：
- 不新增 TSX/React 组件来承载新功能。
- 不新增 `utils.ts`、`helper.ts`、`common.ts` 作为垃圾桶文件。
- 不新增空泛命名：`Manager`、`Helper`、`Common`、`DataInfo`、`DataItem`、`handleData`、`processData`，除非上游同类代码已有明确先例。
- 不在 view 文件里写 CSV/JSON/表格解析器、缓存策略、worker 协议和持久化逻辑。
- 不用 `any`、空 `catch`、无释放 listener、重复业务前缀、为样式添加无语义 DOM。
- 不为了通过编译把类型断言一路写到底；先修类型边界。

每次改动怎么收口：
- 改到一个旧文件时，至少顺手清掉触碰范围内的死代码、重复类型、无用 import、临时注释和明显多余的业务前缀。
- 但不要借小功能做大搬家；重命名、拆文件、迁移 React 这类改动必须限制在当前需求直接触碰的范围内。
- 如果发现现有代码明显偏离上游，先让新增代码按正确方式落地，再把相邻旧代码小步迁过去。
