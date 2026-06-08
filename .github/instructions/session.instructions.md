---
description: Architecture documentation for CS Session. Use when working in `src/cs/workbench/services/session`
applyTo: 'src/cs/workbench/services/session/**'
---

ISessionService
  对外接口：别人能调用什么

SessionService
  实现类：真正负责更新、提交、发事件

SessionModel
  内部数据：当前 session 到底有哪些 file/raw table/assessment/block/curve/metric

SessionSnapshot
  对外只读快照：别人能安全读取什么

## ISessionService

`src/cs/workbench/services/session/common/sessionService.ts` 
- 定义接口 ISessionService

## SessionService

`src/cs/workbench/services/session/browser/sessionService.ts` 
- 定义 SessionService 实现，负责更新、提交、发事件
- SessionModel 是 SessionService 内部维护的 canonical domain state，用来集中保存当前 session 的文件、原始表、assessment、measurement blocks、series、curves、metrics，以及少量跨视图协调状态 activeTarget。
- SessionService 是 sessionModel 的唯一修改者，负责维护 sessionModel 的更新和变更通知。SessionModel 是 session 的 canonical state，包含 session 里所有的数据。外部只能通过 getSnapshot() 读取 sessionModel 快照，不能直接修改 sessionModel
- SessionService 内部维护一个可变的 sessionModel，当有更新时，更新这个 sessionModel，并通过 onDidChangeSession 事件通知外部
SessionModel 不是 service。
SessionModel 不包含业务动作。
SessionModel 不对外暴露可变引用。
SessionModel 只描述 session 当前保存了哪些 canonical data。

只有 SessionService 可以修改 SessionModel。
外部模块只能通过 ISessionService 读取 snapshot 或提交更新请求。

## SessionModel

`src/cs/workbench/services/session/common/sessionModel.ts` 
- 定义唯一真相源
- 它定义 session 里“到底有什么”。
- SessionModel 里包含了 session 里所有的数据，外部只能getsnapshot()读不能改
- SessionModel 里不包含 service cache、worker lifecycle、request state等非 canonical 数据。
- SessionModel 里不包含 view state，view state 可以逐步拆出去，放在对应的 service 或 contrib 里。
- SessionModel 里不包含 UI 状态，UI 状态可以放在 contrib 里

```typescript
export type SessionModel = {
  readonly version: 1;

  readonly filesById: Record<FileId, FileRecord>;
  readonly fileOrder: FileId[];

  readonly rawTablesById: Record<RawTableId, RawTableRecord>;
  readonly rawTableVersionsById: Record<RawTableId, number>;

  readonly assessmentsByRawTableId: Record<RawTableId, RawTableAssessmentRecord>;

  readonly seriesById: Record<SeriesId, SeriesRecord>;
  readonly seriesOrder: SeriesId[];

  readonly curvesByKey: Record<CurveKey, CurveRecord>;
  readonly metricsByKey: Record<MetricKey, MetricRecord>;

  readonly activeTarget: SessionTarget;
};
```

* info:
viewState 建议逐步从 SessionModel 里拆出去。现在 SessionViewState 同时包含 table/template/parameters/chart/curves UI 状态。
你的新方向下，更符合 VSCode 的拆法是：

table view state      -> contrib/table 或 services/table
template view state   -> contrib/template
parameters view state -> contrib/parameters
chart view state      -> services/chart 或 contrib/chart
curves visibility     -> services/chart

Session 可以保留 activeTarget，但不要继续拥有所有 UI view state。

### activeTarget

```typescript
export type SessionTarget =
  | { readonly kind: "none" }
  | { readonly kind: "file"; readonly fileId: FileId }
  | {
      readonly kind: "rawTable";
      readonly fileId: FileId;
      readonly rawTableId: RawTableId;
    }
  | {
      readonly kind: "rawTableRange";
      readonly fileId: FileId;
      readonly rawTableId: RawTableId;
      readonly range: RangeRef;
    }
  | {
      readonly kind: "measurementBlock";
      readonly fileId: FileId;
      readonly measurementBlockId: MeasurementBlockId;
    }
  | {
      readonly kind: "series";
      readonly fileId: FileId;
      readonly measurementBlockId: MeasurementBlockId;
      readonly seriesId: SeriesId;
    }
  | {
      readonly kind: "curve";
      readonly fileId: FileId;
      readonly curveKey: CurveKey;
    }
  | {
      readonly kind: "metric";
      readonly fileId: FileId;
      readonly metricKey: MetricKey;
    };
```
- activeTarget 是跨 Table / Chart / Parameters / Search 共用的当前对象。
- 所以它可以留在 SessionModel。

sessionmodel 里应该放什么，不应该放什么？
应该放：

files
raw tables
raw table versions
assessment results
measurement blocks
series
curves
metrics
activeTarget 非必须

不应该放：

viewState
UI state
table scroll
chart zoom
legend 展开状态
template panel 展开状态
worker lifecycle
request state
service cache
- chart zoom / legend 展开 / table scroll / template panel 展开状态


## 说人话：
SessionModel 就是当前项目/当前分析会话的内存账本。
SessionService 负责改账本。
ISessionService 是别人找 SessionService 办事的窗口。
SessionSnapshot 是别人看到的账本复印件。

activeTarget 是账本里一个特殊的字段，记录了当前用户正在看的/操作的对象，可以是一个文件、一张表、一个测量块、一条曲线等等。UI 可以根据 activeTarget 的变化自动切换显示内容。但他不该存在，因为在vscode中，应该是各领域 / 各 view / 各 service 维护自己的 active / focus / selection
需要联动的人订阅对应 service 的事件
不要把所有 active 状态塞进一个全局 SessionModel

更准确一点，不是“所有人各自乱存”，而是谁拥有这个 UI/领域对象，谁维护它的 active 状态。

VSCode 里 editor 相关的 active 状态归 IEditorService，它对外暴露 onDidActiveEditorChange、activeEditorPane、activeEditor、activeTextEditorControl 等；这说明 active editor 是 editor service 的领域状态，不是一个全局 session model 字段。

list/table/tree 这类控件也类似。VSCode 的 IListService 只记录 lastFocusedList，ListService 在 list focus 时更新它；具体 selection 仍然主要由对应 list/tree/table widget 自己维护，不是塞到某个全局 model 里。

所以你这里应该改成：

SessionModel
  保存 canonical data：
  files
  rawTables
  assessments
  measurementBlocks
  series
  curves
  metrics

TableService / TableView
  保存当前 table selection / focused row / focused range

ChartService / ChartView
  保存当前 active curve / visible curves / hover point / zoom display state

ParametersService / ParametersView
  保存当前 active metric / selected parameter row

SearchService / SearchView
  保存当前 search query / selected result

TemplateService / TemplateView
  保存当前 template selection / pending config
