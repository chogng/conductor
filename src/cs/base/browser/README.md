event.ts：DOM 事件订阅、释放、事件名常量、组合 disposable
mouseEvent.ts：把浏览器 MouseEvent / WheelEvent 翻译成稳定的内部事件对象，负责“鼠标事件怎么标准化”
dom.ts 负责把这些能力组合成上层可直接用的工具
window.ts 负责认窗口

map.ts 里放的是一组常用的数据结构和辅助函数，主要解决两类问题：

让普通的 Map / Set 更好用，比如 map.ts:8、map.ts:18、map.ts:27。
提供 VS Code 自己常用的特殊容器，比如：
map.ts:48：用 URI 当 key 的 Map
map.ts:153：用 URI 当 key 的 Set
map.ts:227：保持插入顺序、支持前后移动的 Map
map.ts:678 和 map.ts:695：缓存容器
map.ts:807：一个 key 对应多个值的集合映射
map.ts:751：双向映射
它的定位和 event.ts 那类基础文件很像，都是 common 层的基础设施，只不过一个管事件，一个管集合和缓存。

browser.ts文件可以理解成“浏览器环境能力和状态的入口”。

它主要做几件事：

记录每个窗口的浏览器状态，比如 browser.ts:77、browser.ts:86、browser.ts:93
提供浏览器/平台特征判断，比如 browser.ts:103、browser.ts:105、browser.ts:106、browser.ts:108
处理 PWA / Window Controls Overlay 相关能力，比如 browser.ts:126、browser.ts:133、browser.ts:139
暴露 Monaco 环境配置入口，比如 browser.ts:160
它不是 DOM 工具本身，也不是纯业务逻辑，而是“浏览器环境状态 + 特性检测”的基础模块。很多 browser 层文件都会依赖它，比如 mouseEvent.ts:6、dom.ts:6、keyboardEvent.ts:6。
在 VS Code 里，很多界面代码其实都依赖浏览器能力：window、document、matchMedia、navigator.userAgent、fullscreen、zoom、PWA、Window Controls Overlay。这些东西不是业务逻辑的一部分，但又会影响整个 UI 怎么工作，所以需要一个统一入口来管理。这个入口就是 browser.ts。

它存在的意义主要是：

把浏览器差异集中起来，不要让每个文件都自己读 navigator.userAgent
统一管理每个窗口的浏览器状态，比如缩放、全屏
提供环境判断，比如是不是 Chrome、Firefox、Electron、Safari
处理浏览器特有能力，比如 PWA、WCO、MonacoEnvironment

- List 是“基础显示引擎”。它负责把一串元素按当前滚动窗口画出来，做虚拟滚动、复用行、滚动定位、选择、焦点、拖拽、键盘导航这些通用能力。它本质上不关心父子层级，只关心“当前该显示哪些行”。你可以看 listView.ts:281 和 listWidget.ts:1395。
- Tree 是“层级语义 + 展开折叠”。它建立在 List 之上，额外负责父子关系、展开/收起、懒加载子节点、过滤、压缩节点、树状态保存，以及把“树模型”转换成“可渲染的线性行列表”。你可以看 tree.ts:120 和 abstractTree.ts:2593。
- AsyncDataTree 是 Tree 的一个异步数据版本：它接收数据源，等子节点异步返回，再交给底层 Tree/List 去渲染。它本身不是渲染器，而是把“异步树数据”接到基础树控件上。见 asyncDataTree.ts:530。
- WorkbenchCompressibleAsyncDataTree 是 workbench 层的包装，给 Tree 加上 VS Code 里常用的上下文、配置、样式和资源导航能力。见 listService.ts:1037。
一句话总结：

List 解决“怎么高效画一串行”
Tree 解决“怎么把层级结构变成这串行并支持展开折叠”

list.ts 主要放当前列表公共契约，比如 ListProps、ListHandle、ListRenderState。
listView.ts 是低层 DOM 实现，负责虚拟滚动、测量、滚动定位、聚焦、选中和键盘导航。
listWidget.ts 是对 listView 的上层封装，负责把 DOM 列表能力接成更好用的组件入口。
list.css 是基础样式。List/ListView 的 DOM 结构、滚动视口和行样式都依赖它。
如果把这几层串起来看，就是：

list.ts = 接口和约定
listView.ts = 虚拟滚动引擎
listWidget.ts = 组件入口封装
listWidget.ts 是更高一层的 List 组件。它把 listView.ts 包起来，补上选择、焦点、键盘导航、类型搜索、可访问性等“列表产品层”能力。你一般直接用它，而不是直接碰 ListView。
listPaging.ts 是分页列表的适配层。它把一个按页懒加载的模型接到 List 上，未解析的项先显示占位，等数据回来再替换。
rangeMap.ts 是索引和像素位置的映射工具。它负责算某个元素在第几行、顶部偏移多少、可见范围对应哪些 index。
rowCache.ts 是行模板缓存。它复用 DOM row，避免频繁创建和销毁，虚拟滚动性能主要靠它省下来的。

# splice.ts 是 splice 组合器工具。它让多个可 splice 的对象同步接收同一段增删改。

list.css 是基础样式。List/ListView 的 DOM 结构、滚动条、拖拽态、行样式等都依赖它。
如果把这几层串起来看，就是：

list.ts = 接口和约定
listView.ts = 虚拟滚动引擎
rowCache.ts = 行复用
rangeMap.ts = 索引与像素映射
listWidget.ts = 面向 workbench 的完整列表组件

listPaging.ts 不是“分页逻辑的业务层”，它更像一个适配器：把一个按页、可异步解析的数据模型，包装成普通的 List 来用。真正的虚拟滚动还是 listView.ts 那套在做；listPaging 只是让 List 能接住 “先有索引、后补数据” 这种模型。

你可以把它理解成三步：

先把模型长度塞给 List，List 先显示一堆索引位
某个索引如果还没解析出来，就先画占位内容
等 model.resolve(index) 完成后，再把占位替换成真实内容
对应到代码里，核心就是 listPaging.ts 里的这些思路：

PagedList 内部还是 new List(...)
PagedRenderer 负责：已解析就 renderElement，未解析就 renderPlaceholder
model.onDidIncrementLength 会把新页追加到列表里
能滚动和可见区渲染的，还是 listView.ts。

所以它的重要性体现在：

它让 List 能接分页数据
它负责占位和解析后的替换
它把“分页模型”接入了统一的列表体系

rowCache.ts 是 ListView 的行复用缓存，核心作用就是少创建、少销毁 DOM row。

它做的事很直接：

alloc(templateId)：拿一个可复用的 row；如果没有缓存，就创建新的 row 和模板数据
release(row)：把 row 放回缓存，等下次同模板再复用
transact(...)：把一批 splice 里的删除和插入包起来，避免刚删掉又立刻插回来的 row 真的从 DOM 里移除再重建
它重要的原因是：虚拟列表滚动时，元素会不断进出视口，如果每次都重新创建 DOM，性能会很差。RowCache 就是专门配合 listView.ts 做这个优化的。

所以你可以把它理解成：

listView.ts 负责“哪些行该显示”
rowCache.ts 负责“这些行能不能复用，不要老重建”

RowCache 之所以和 splice 配合，是为了让列表在插入、删除、滚动时尽量复用已经创建过的行 DOM，而不是每次都销毁重建。

它的关键点在 rowCache.ts：

alloc(templateId) 会优先从缓存里拿同模板的 row
release(row) 会把 row 放回缓存，供下次复用
transact(...) 会把一批变更包起来，延迟真正移除 DOM 的动作
这个设计和 listView.ts 里的 splice 很配合。ListView 在更新一段元素时，常见情况是某些行刚被删除、紧接着又在新的位置插回来了。没有 transact 的话，这些 row 会先从 DOM 里移除，再马上创建回来，抖动和开销都更大。transact 的作用就是把这种“先删后插”的中间态吞掉，减少真实 DOM 操作。

所以你可以这么理解：

listView.ts 决定哪些元素该进出视口
rowCache.ts 决定这些行能不能复用
splice.ts 提供把多个可 splice 对象同步更新的工具