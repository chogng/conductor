---
description: Architecture documentation for CS services`
applyTo: 'src/cs/workbench/services/**'
---

## Guidelines

- 所有业务动作走 service，不让 UI 直接改 session model。
- session 对外只暴露 ISessionService / SessionSnapshot / events。
- view state 不进入 SessionModel。
- RawTableRecord 只保存原始表格事实。
- AssessmentService 负责识别 block / group / column role / sweep mode。
- Template / Chart / Table / Search 只消费 assessment result，不重复判断。
- service cache / worker lifecycle / request state 不进入 canonical record。

## Service 职责划分
SessionService
  只保留 session 级上下文

TableService
  管 table view state

ChartService
  管 chart view state

TemplateService
  管 template view state + template 管理

ParameterService


flowchart TD
    Commands[Commands / Actions / Controllers] --> Session[ISessionService]

    Commands --> ChartService[IChartService]
    Commands --> TableService[ITableService]
    Commands --> TemplateService[ITemplateService]
    Commands --> AssessmentService[IAssessmentService]
    Commands --> ParameterService[IParameterService]

    Session --> Snapshot[SessionSnapshot]
    Session --> SessionEvent[onDidChangeSession]

    SessionEvent --> ChartService
    SessionEvent --> TableService
    SessionEvent --> TemplateService
    SessionEvent --> AssessmentService
    SessionEvent --> ParameterService

    ChartService --> ChartView[Chart View]
    TableService --> TableView[Table View]
    TemplateService --> TemplateView[Template UI]
    AssessmentService --> AssessmentView[Assessment UI]
    ParameterService --> ParameterView[Parameter UI]

### Additional info
- SessionService 不直接服务 ChartView
- SessionService 不知道 ChartView 怎么刷新
- ChartService 订阅 SessionService
- ChartView 订阅 ChartService



## the newest broder for the services
flowchart TD
    UI[UI / Command / Controller] --> SessionAPI[ISessionService]

    UI --> Assessment[AssessmentService]
    UI --> Template[TemplateService / TemplateApplyService]
    UI --> Chart[ChartService]
    UI --> Table[TableService]
    UI --> Parameters[ParametersService]

    Assessment --> SessionAPI
    Template --> SessionAPI
    Chart --> SessionAPI
    Table --> SessionAPI
    Parameters --> SessionAPI

    SessionAPI --> SessionModel[SessionModel canonical dataset]

    SessionModel --> Files[filesById / fileOrder]
    SessionModel --> Active[activeTarget]
    SessionModel --> Version[sessionVersion]

    Files --> FileRecord[FileRecord]
    FileRecord --> Raw[RawRecord]
    FileRecord --> Assess[AssessmentRecord / CurveAssessment]
    FileRecord --> TemplateRun[TemplateRunRecord]
    FileRecord --> Series[SeriesRecord]
    FileRecord --> Curves[curvesByKey]
    FileRecord --> Metrics[metricsByKey]