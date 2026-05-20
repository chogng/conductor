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

list.ts (line 13) 主要放契约、类型、事件模型、拖拽协议和少量可复用抽象，比如 IListVirtualDelegate、IListRenderer、IListDragAndDrop、ListError、CachedListVirtualDelegate。
listView.ts (line 231) 是低层实现，负责虚拟滚动、DOM 渲染、测量、滚动、拖拽、可访问性等，ListView 本体也在这里。
listWidget.ts (line 1409) 是更高一层的封装，List<T> 把 ListView 组装起来，再叠加选择、聚焦、键盘导航等行为。