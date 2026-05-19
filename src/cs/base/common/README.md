date.ts, lines 260 to 318

这个文件是“时间和日期文案工具”。

它主要负责两件事：

把时间差变成人能读懂的话
比如 date.ts:26 会把某个时间转成 now、3 mins ago、2 days ago 这种相对时间。
date.ts:208 还会优先返回 Today、Yesterday。

把持续时间格式化
比如 date.ts:235 会把毫秒变成 40ms、3.2s、5 mins、2 hrs 这种显示文本。
-------------------------------------------------------
layout.ts是“布局计算工具”，更准确说是给弹层、菜单、提示框这类东西算位置的。

layout.ts 本身不负责渲染，它只做几何计算：给你一个 viewport、一个 view、一个 anchor，然后算出这个 view 应该放在哪，尽量别超出屏幕，也尽量别和锚点重叠。核心就是这两个函数：

layout.ts:66：一维布局，主要算上下或左右的偏移
layout.ts:108：二维布局，直接算 top、left、bottom、right，还会在必要时翻转方向
里面那些类型，比如 layout.ts:8、layout.ts:37、layout.ts:15，都是为了描述“锚点在哪里、视图多大、往哪边贴”。

你可以把它理解成：

这是一个纯数学/几何文件
用来决定浮层出现在元素的上面、下面、左边还是右边
如果空间不够，就自动翻边，或者退而求其次覆盖一点
-------------------------------------------------------
async.ts文件是异步基础工具层，专门放和 Promise、取消、排队、延迟、定时相关的通用能力，不是业务代码。

你可以把 async.ts:1 理解成一组“异步小组件”：

async.ts:34：可取消的 Promise
async.ts:87 和 async.ts:109：把取消 token 和 Promise 竞速
async.ts:231、async.ts:296、async.ts:305：控制任务排队和串行执行
async.ts:389 和 async.ts:467：做延迟、节流
async.ts:1022、async.ts:1076、async.ts:1108：定时器和调度
async.ts:1749：手动控制 resolve / reject 的 Promise
后面还有 async iterable 相关工具，给流式异步数据用
-------------------------------------------------------
actions.ts 是“动作 / 命令对象模型”文件。

它定义的不是按钮本身，而是“一个可执行的动作应该长什么样、怎么运行、怎么被统一调度”。里面最核心的是：

actions.ts:30：动作接口，包含 id、label、enabled、run
actions.ts:173：统一执行动作，并发出运行前/运行后的事件
actions.ts:60：一个具体的可变动作实现
actions.ts:203：菜单分隔线
actions.ts:253：子菜单动作
actions.ts:284：把普通对象快速包成 IAction