
# 基础数据与规则
files.ts:27 放的是这套功能的公共常量和协议：Explorer 的 view id、context key、配置类型、命令相关常量。
explorerModel.ts:1 是文件树的数据模型，核心是 workspace 根节点和每个文件项怎么表示、查找、增删改。
explorerFileNestingTrie.ts:1 处理 file nesting，也就是像把同类文件折叠成层级关系那套规则。
dirtyFilesIndicator.ts:1 负责左侧 Explorer 上“未保存文件”徽标。

# 侧边栏和树视图
explorerViewlet.ts:155 是左侧 sidebar 的容器注册点，把 Explorer 视图挂进去。
explorerView.ts:154 是文件树视图本体，负责创建 tree、刷新、选择、展开、拖拽、右键菜单、自动 reveal。
explorerViewer.ts:870 是真正画每个文件节点的渲染层，具体负责文件名、图标、装饰、压缩文件夹、输入框、无障碍属性。
openEditorsView.ts:1 是 Explorer 里的“Open Editors”列表，展示当前打开的编辑器。
browser/views/emptyView.ts 是空工作区时显示的替代视图。

# CSS 归位
上游 files contrib 的主样式不是按 explorerViewer.ts 单独拆一个 viewer css，而是由 explorerViewlet.ts 引入 browser/media/explorerviewlet.css。
这个 explorerviewlet.css 同时覆盖 viewlet 外层、Explorer 主 view、树节点/item 等内部渲染样式，比如 explorer-item、monaco-list-row、输入框编辑态。
browser/views/media 只给相对独立的子 view 使用，例如 openEditorsView.ts 引入 browser/views/media/openeditors.css。
对应到 import contrib，sidebar import 主区域的样式放 browser/media/importerViewlet.css；只有后续出现独立子 view，才放 browser/views/media/*.css。

# 服务层
explorerService.ts:1 是 Explorer 的状态和操作中心，管 workspace roots、刷新、选中、批量文件操作、响应文件事件。
browser/explorerDecorationsProvider.ts 给文件树提供装饰信息，比如错误、修改、git 相关标记。
explorerFileContrib.ts:1 提供“每个文件节点可插拔的额外渲染能力”，比如某些扩展在文件行里追加按钮或内容。
browser/workspaceWatcher.ts 负责监听工作区级别变化，驱动 Explorer 刷新。

# 编辑器相关
fileEditorInput.ts:1 是文件编辑器输入的抽象，封装资源、标签、只读状态、模型关联。
textFileEditor.ts:1 是文本文件编辑器，处理打开、模型绑定、二进制文件兜底、错误提示。
browser/editors/binaryFileEditor.ts 是二进制文件的编辑器兜底。
browser/editors/fileEditorHandler.ts 负责把资源路由到合适的文件编辑器。
browser/editors/textFileEditorTracker.ts 跟踪文本编辑器和文件状态的联动。
browser/editors/textFileSaveErrorHandler.ts 处理文本文件保存失败的错误流。

# 命令、动作、导入导出
fileActions.ts:1 是文件操作动作本体：新建、删除、重命名、复制、粘贴、保存、下载、上传等。
fileCommands.ts:1 是这些操作对应的命令、快捷键和上下文选择逻辑。
fileImportExport.ts:1 处理浏览器里的文件上传/下载、拖拽导入导出。
browser/fileConstants.ts 放各种命令 id、标签和配置键常量。
browser/fileActions.contribution.ts 是把这些 actions/commands 挂到 workbench 的贡献入口。

# 按真实执行顺序看，大概是这样：

explorerViewlet.ts 先把 Explorer 这个视图挂到左侧容器里。这里决定的是“左栏里有一个 Explorer 区块”，不是具体怎么画文件。
explorerView.ts 里的 ExplorerView 负责创建树、绑定事件、刷新数据、处理展开/选择/拖拽/右键菜单。你可以把它看成 Explorer 的控制层。
在 explorerView.ts 的 createTree() 里，它会创建一个 WorkbenchCompressibleAsyncDataTree，并把数据源、排序器、拖拽处理、压缩规则和渲染器都塞进去。
其中真正把每个文件项画出来的是 explorerViewer.ts 里的 FilesRenderer。它负责文件名、图标、装饰、压缩文件夹、编辑态输入框和无障碍属性。
数据来源和状态则主要在 explorerService.ts 和 explorerModel.ts 里：前者管刷新、选择、批量操作和事件，后者管文件树模型本身。
所以这条链路可以粗略记成：

左侧容器 -> ExplorerView -> Tree -> FilesRenderer -> ExplorerModel / ExplorerService
