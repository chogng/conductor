# plan_v013 — 完整版：Files / TableFacts + Recipe/UserTemplate / Template / ReviewDecision / Explorer / SliceRequest / Slice 架构方案

> 版本定位：`plan_v011` 的完整内容 + `plan_v012` 的实现级修正。  
> 说明：`plan_v012` 写成了 delta patch，作为完整方案不够完整。`plan_v013` 是完整替代版。
>
> 核心原则：
>
> 1. Files 提供 raw table 原始事实。
> 2. Template = TableFacts + Recipe/UserTemplate：Template 职责面负责把具体表格事实和固定规则/用户模板 materialize 成候选 Template。
> 3. TableFacts 是正式表格事实层；旧迁移 helper 命名不能演进成独立 evidence service。
> 4. Review 是模板可用性、手动调整建议、系统应用建议的唯一决策层。
> 5. Explorer 订阅 ReviewRecord，并与 SliceRun 状态合成 UI 状态。
> 6. ReviewApplyContribution 只做幂等提交桥接，不做模板质量判断。
> 7. Slice 只执行统一 SliceRequest，不区分 auto/manual。
> 8. UserTemplate 独立为 services/userTemplate + contrib/userTemplate。
> 9. Template provenance 和 execution trigger 分离。
> 10. 旧 table-fact 迁移命名已退场，不能继续作为主链路概念或兼容壳保留。
> 11. Recipe/UserTemplate candidate materializer 归 Template；TemplateResolution 已退场，不能作为退休兼容桥复活。
> 12. 旧 Auto Extraction 退场；默认选择语义是 Review 推荐的 Template，不是从 raw rows 绕过 Template/Review 的自动提取旁路。

---

## 1. 最终主链路

```txt
Files
  -> RawTableRecord

Template
  = TableFacts + Recipe/UserTemplate
  -> TemplateCandidate / TemplateDraft / Template

Review
  -> ReviewDecision / ReviewedTemplate

Slice
  -> SliceRequest / SlicePlan / SliceRun
```

不存在单独的 Auto Extraction 主链路。系统推荐模板必须来自
`TableFacts + Recipe/UserTemplate -> Template -> Review`，Slice 只消费
`ReviewedTemplate` 或手动 review 后的 Template snapshot。

主链路展开：

```txt
Files
  |
  v
TableFacts
  + Recipe/UserTemplate snapshots
  |
  v
Template materialization
  |
  v
TemplateCandidate / TemplateDraft / Template
  |
  v
ReviewService
  |
  v
RawTableReviewRecord
  |
  +--> Explorer projection
  |      ReviewRecord + SliceRun/SliceState -> UI status
  |
  +--> ReviewApplyContribution
          |
          | ready + systemRecommended
          v
       SliceRequest
          |
          v
       SliceService.submit
          |
          v
       SlicePlan / Executor / SliceRun
```

Recipe 和 UserTemplate 是 candidate source，不是 decision source。Template
负责把它们和具体表格事实组合起来：

```txt
TableFacts + RecipeSnapshot
  -> Template recipe materializer
  -> TemplateDraft / Template

TableFacts + UserTemplateSnapshot
  -> Template user-template materializer
  -> TemplateDraft / Template
```

Review 是唯一把候选变成可执行 `ReviewedTemplate` 和应用建议的层：

```txt
TemplateDraft / Template
  -> TemplateReview
  -> ReviewDecision
  -> RawTableReviewRecord
```

TemplateResolution 不在主链路，且旧
`RawTableTemplateResolutionRecord` summary bridge 已退场。不要恢复
`ITemplateResolutionService`、`commitTemplateResolutions`、或
`templateResolutionChanged` 事件；候选由 Template materializers 产生并直接交给
Review。

记录提交边界：

```txt
TableFacts
  -> ISessionService.commitRawTableFacts

Review
  -> ISessionService.commitRawTableReviews

Slice
  -> ISessionService.commitSliceRuns
```

手动路径：

```txt
Template UI / UserTemplate picker / command
  -> user selects Template or UserTemplate
  -> ReviewService.reviewManualTemplate(...)
  -> ManualTemplateReviewResult
  -> if ready: create SliceRequest(trigger = userCommand)
  -> SliceService.submit
```

---

## 2. 最终职责边界

### 2.1 Files

Files 是 raw facts owner。

负责：

```txt
fileId
fileName
file kind
sourcePath / relativePath
source size
lastModified
rawTableId
raw table source: csv / excelSheet / unknown
row storage: inline / normalizedCsv / unavailable
rowCount
columnCount
maxCellLengths
health
raw table processing eligibility
```

不负责：

```txt
measurement family
transfer/output/CV/CF
column role
unit semantic
block detection
TemplateDraft
ReviewDecision
Slice
```

### 2.2 Template TableFacts

TableFacts 是 Template materialization 的表格事实输入。正式服务入口是
`IRawTableFactsService` / `RawTableFactsRecord`；当前实现文件位于
`services/tableFacts`。不要保留旧服务、record、command 名作为兼容壳或迁移别名。
不要新建独立 evidence service；目标是把
`Recipe/UserTemplate + TableFacts -> Template` 收到 Template 职责面。
目标文档、目标 API 和新代码应使用 TableFacts/RawTableFacts 命名。

负责：

```txt
RawTableStructure
header row
unit row
data region
schema fingerprint
ColumnProfile
LayoutCandidate
ColumnSemanticCandidate
MeasurementBlock
family / mode evidence
schema profile exact match
diagnostics
```

不负责：

```txt
不作为独立 domain 解释 Recipe
不生成 TemplateDraft
不生成 ReviewDecision
不判断能否系统应用
不创建 SliceRequest
不执行 Slice
```

### 2.3 Recipe

Recipe 是系统固定规则来源。`Recipe` 本身不读取表格、不生成 Review
decision、不写 Session；Template materializer 解释 `RecipeSelector` /
`RecipeProjection`。

```txt
TableFacts + Recipe -> TemplateDraft / Template
```

不负责：

```txt
不 review
不选择 final template
不决定 systemRecommended
不执行 Slice
不写 Session
```

### 2.4 UserTemplate

UserTemplate 是用户模板库领域对象。`UserTemplate` 本身不做 Review；
Template materializer 根据 `UserTemplateSnapshot` 和 `TableFacts` 产生
候选 Template。

```txt
TableFacts + UserTemplateSnapshot -> TemplateDraft / Template
```

不负责：

```txt
不做 ReviewDecision
不执行 Slice
不写 RawTableReviewRecord
```

### 2.5 Review

Review 是模板可用性和应用建议的唯一决策层。

负责：

```txt
消费 Template materializer 输出的 TemplateDraft / TemplateCandidate
审核候选
计算 TemplateReview
选择 ReviewedTemplate
输出 ReviewDecision
判断 ready / needsManualAdjustment / invalid
判断 systemRecommended / userActionRequired
处理 manual template review
处理 user override
```

不负责：

```txt
不读 raw rows
不重新检测 block/column
不解释 RecipeProjection
不 materialize Template
不执行 Slice
不管理 UserTemplate catalog
不管理 Recipe catalog
不直接更新 Explorer UI
```

### 2.6 Explorer

Explorer 是 UI projection consumer。

负责合成：

```txt
ReviewRecord
SliceRun
SliceQueue
```

展示：

```txt
ready / needs adjustment / invalid
queued / running / succeeded / failed / stale
primary message
available actions
```

不负责：

```txt
不判断 confidence 是否够
不判断 candidate conflict
不判断 systemRecommended
不创建 ReviewDecision
```

### 2.7 ReviewApplyContribution

ReviewApplyContribution 是无 UI 的桥接层。

负责：

```txt
监听 reviewChanged
读取 ReviewDecision
如果 ready + systemRecommended
执行幂等 guard
创建 SliceRequest
调用 SliceService.submit
```

不负责：

```txt
不计算 confidence
不解释 diagnostics
不判断 candidate margin
不判断模板是否需要调整
不执行 Slice
```

### 2.8 Slice

Slice 是纯执行层。

负责：

```txt
SliceRequest queue
dedupe / cancellation / priority
generic staleness
SlicePlan creation
TS/Rust executor dispatch
SliceCommit normalization
Session.commitSliceRuns
progress/status event
```

不负责：

```txt
不分 auto/manual
不判断 ReviewDecision
不解释 Recipe
不读取 UserTemplate catalog
不计算 confidence
```

---

## 3. TableFacts 退场边界与 Template ownership

TableFacts 只承载 raw table / column / semantic / block facts。目标不是把
历史迁移形态改名成独立 evidence domain，而是把
`Recipe/UserTemplate + TableFacts -> Template` 的 ownership 收进 Template。
不要让 TableFacts 输出候选排序、最终模板、或系统应用建议。

旧 table-fact 迁移记录可能混了两类能力：

```txt
1. raw table / column / semantic / block analysis
2. selected template / confidence / can auto apply / needs user action
```

v013 的责任归属为：

```txt
TableFacts:
  第 1 类，作为 Template materialization 输入。

Review:
  第 2 类。
```

不要把带旧决策字段的旧导入/持久化记录直接当作 TableFacts，因为旧 record
可能还有：

```txt
retired application decision fields
templateCandidates
selectedTemplate
recipeFingerprint
```

这些字段不属于 TableFacts。

目标记录名是 `RawTableFactsRecord`。读取旧持久化数据或迁移 fixture 时，
必须先剥离不属于 TableFacts 的字段：

```txt
retired table-fact import record
  -> createRawTableFactsFromRecord(...)
  -> RawTableFactsRecord-compatible facts only
```

不得新增旧命名 adapter，也不得重新暴露旧服务、record、command 名。

---

## 4. Core Template

`Template` 是 executable spec shape，也是 `TableFacts + Recipe/UserTemplate`
materialization 的职责面。

位置：

```txt
src/cs/workbench/services/template/common/templateSpec.ts
```

类型：

```ts
export type Template = {
  readonly schemaVersion: 1;
  readonly id?: string;
  readonly name: string;
  readonly version: number;
  readonly blocks: readonly TemplateBlock[];
  readonly stopOnError: boolean;
  readonly applicability?: TemplateApplicability;
};
```

`services/template` 保留 core Template 能力，并接收新的 pure
materializer：

```txt
templateSpec.ts
templateCodec.ts
templateValidation.ts
templateFingerprint.ts
templateRange.ts
templateDraft.ts
recipeTemplateMaterializer.ts
userTemplateMaterializer.ts
templateApplyPresetAdapter.ts
```

不负责：

```txt
UserTemplate catalog
Review
Slice
Session persistence
UI
```

---

## 5. UserTemplate 独立 domain

UserTemplate 是用户模板库对象，不是 Template 本体。

### 5.1 UserTemplate 类型

```ts
export type UserTemplateScope =
  | "workspace"
  | "global";

export type UserTemplateSource =
  | "userCreated"
  | "imported"
  | "confirmedFromReview";

export type UserTemplate = {
  readonly id: string;
  readonly name: string;
  readonly version: number;

  readonly scope: UserTemplateScope;
  readonly source: UserTemplateSource;

  readonly template: Template;
  readonly templateFingerprint: string;

  readonly tags?: readonly string[];
  readonly description?: string;

  readonly createdAt: number;
  readonly updatedAt: number;
};
```

### 5.2 UserTemplateSnapshot

```ts
export type UserTemplateSnapshot = {
  readonly version: number;

  readonly workspaceVersion: number;
  readonly globalVersion: number;

  readonly workspaceFingerprint: string;
  readonly globalFingerprint: string;
  readonly effectiveFingerprint: string;

  readonly templates: readonly UserTemplate[];
};
```

短期可以只实现：

```ts
readonly version: number;
readonly effectiveFingerprint: string;
```

但 ReviewRecord 里必须明确 effective fingerprint 是 staleness 依据。

### 5.3 IUserTemplateService

```ts
export interface IUserTemplateService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeUserTemplates: Event<UserTemplateChangeEvent>;

  getSnapshot(): UserTemplateSnapshot;

  getTemplate(id: string): UserTemplate | undefined;

  createTemplate(input: CreateUserTemplateInput): UserTemplate;

  updateTemplate(
    id: string,
    patch: UpdateUserTemplatePatch,
  ): UserTemplate;

  deleteTemplate(id: string): void;

  duplicateTemplate(id: string): UserTemplate;

  importTemplates(input: ImportUserTemplatesInput): UserTemplateImportResult;

  exportTemplates(ids: readonly string[]): UserTemplateExportResult;
}
```

---

## 6. Candidate / Draft / Review / ReviewedTemplate

### 6.1 TemplateDraft

`TemplateDraft` 是 Template materialization pipeline 的完整候选对象，
由 Review 消费，不默认持久化。

```ts
export type TemplateDraft = {
  readonly id: string;
  readonly source: AutomaticTemplateCandidateSource;

  readonly template: Template;
  readonly templateFingerprint: string;

  readonly derivationConfidence: number;
  readonly derivationReasons: readonly string[];
  readonly derivationDiagnostics: readonly TemplateDraftDiagnostic[];

  readonly captures?: Readonly<Record<string, unknown>>;
};
```

`TemplateDraft` 不携带 `ready` / `needsAdjustment` / `invalid` 或旧
`review` 状态；这些由 Review policy 投影为 `TemplateReview`。

```ts
export type TemplateDraftDiagnostic = ReviewDiagnostic;
```

### 6.2 TemplateCandidateSummary

持久化候选摘要。

```ts
export type TemplateCandidateSummary = {
  readonly id: string;
  readonly source: AutomaticTemplateCandidateSource;

  readonly templateFingerprint: string;

  readonly displayName?: string;
  readonly providerRank?: number;

  readonly reasonCodes: readonly string[];
  readonly diagnosticCodes: readonly string[];
};
```

### 6.3 AutomaticTemplateCandidateSource

```ts
export type AutomaticTemplateCandidateSource =
  | {
      readonly kind: "recipe";
      readonly recipeId: string;
      readonly recipeVersion: number;
    }
  | {
      readonly kind: "userTemplate";
      readonly templateId: string;
      readonly templateVersion: number;
    };
```

注意：

```txt
manual 不在 AutomaticTemplateCandidateSource 中。
```

manual/user command 是 SliceRequest trigger，不是候选来源。
`savedTemplate` 是 manual request 的兼容 selection 名称，不是
`AutomaticTemplateCandidateSource`。

### 6.4 TemplateReview

```ts
export type TemplateReviewStatus =
  | "ready"
  | "needsAdjustment"
  | "invalid";

export type TemplateReview = {
  readonly candidateId: string;
  readonly templateFingerprint: string;

  readonly status: TemplateReviewStatus;
  readonly confidence: number;

  readonly reasons: readonly string[];
  readonly diagnostics: readonly ReviewDiagnostic[];
};
```

### 6.5 ReviewedTemplate

`ReviewedTemplate` 描述模板来源，不描述执行来源。

```ts
export type ReviewedTemplateSource =
  | {
      readonly kind: "recipe";
      readonly recipeId: string;
      readonly recipeVersion: number;
    }
  | {
      readonly kind: "userTemplate";
      readonly templateId: string;
      readonly templateVersion: number;
    }
  | {
      readonly kind: "inline";
    };

export type ReviewedTemplate = {
  readonly candidateId: string;
  readonly source: ReviewedTemplateSource;

  readonly template: Template;
  readonly templateFingerprint: string;

  readonly review: TemplateReview;

  readonly userOverride?: {
    readonly confirmedAt: number;
    readonly reason?: string;
  };
};
```

不要在 `ReviewedTemplate.source` 里放：

```txt
manual
auto
userCommand
savedTemplate
```

这些属于 `SliceRequest.trigger`。

---

## 7. ReviewDecision

ReviewDecision 是当前 raw table 的模板决策结果。

```ts
export type ReviewDecision =
  | {
      readonly kind: "ready";
      readonly reviewedTemplate: ReviewedTemplate;

      readonly application:
        | {
            readonly kind: "systemRecommended";
            readonly reason: string;
          }
        | {
            readonly kind: "userActionRequired";
            readonly reason: string;
          };

      readonly summary: string;
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "needsManualAdjustment";
      readonly candidateId?: string;
      readonly summary: string;
      readonly reasons: readonly string[];
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "invalid";
      readonly summary: string;
      readonly reasons: readonly string[];
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    };
```

语义：

```txt
ready + systemRecommended:
  Review 判断模板可用，且建议系统应用。

ready + userActionRequired:
  Review 判断模板可用，但需要用户动作。

needsManualAdjustment:
  候选接近可用，但需要用户调整列、范围、模板、schema profile 或确认歧义。

invalid:
  当前没有安全可用模板。
```

---

## 8. RawTableReviewRecord

```ts
export type RawTableReviewRecord = {
  readonly fileId: string;
  readonly rawTableId: string;

  readonly sourceRawTableVersion: number;
  readonly evidenceSignature: string;

  readonly recipeFingerprint: string;

  readonly userTemplateWorkspaceVersion: number;
  readonly userTemplateGlobalVersion: number;
  readonly userTemplateWorkspaceFingerprint: string;
  readonly userTemplateGlobalFingerprint: string;
  readonly userTemplateEffectiveFingerprint: string;

  readonly reviewEngineVersion: number;
  readonly reviewPolicyVersion: number;

  readonly candidates: readonly TemplateCandidateSummary[];
  readonly reviews: readonly TemplateReview[];

  readonly decision: ReviewDecision;

  readonly createdAt: number;
};
```

短期简化版本：

```ts
export type RawTableReviewRecord = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly sourceRawTableVersion: number;
  readonly evidenceSignature: string;

  readonly recipeFingerprint: string;
  readonly userTemplateCatalogVersion: number;
  readonly userTemplateEffectiveFingerprint: string;

  readonly reviewEngineVersion: number;
  readonly reviewPolicyVersion: number;

  readonly candidates: readonly TemplateCandidateSummary[];
  readonly reviews: readonly TemplateReview[];

  readonly decision: ReviewDecision;

  readonly createdAt: number;
};
```

不再保留：

```txt
autoSliceAllowed
applyRecommendation
selectedReviewedTemplate 单独字段
```

因为：

```txt
selected reviewed template 在 decision.kind === "ready" 时由 decision.reviewedTemplate 提供。
系统应用建议在 decision.application 中。
```

---

## 9. ManualTemplateReviewResult

手动模板也必须经过 Review，但不进入自动 candidate ranking。

请求：

```ts
export type ManualTemplateReviewRequest = {
  readonly ref: RawTableRef;

  readonly selection:
    | {
        readonly kind: "userTemplate";
        readonly templateId: string;
      }
    | {
        readonly kind: "inline";
        readonly template: Template;
      };
};
```

结果：

```ts
export type ManualTemplateReviewResult =
  | {
      readonly kind: "ready";
      readonly reviewedTemplate: ReviewedTemplate;
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "needsManualAdjustment";
      readonly review: TemplateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "invalid";
      readonly review?: TemplateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    };
```

手动执行链：

```txt
User selected UserTemplate / inline Template
  -> ReviewService.reviewManualTemplate
  -> ManualTemplateReviewResult
  -> if ready: SliceRequest(trigger=userCommand)
  -> SliceService.submit
```

不允许：

```txt
reviewManualTemplate(...): ReviewedTemplate | null
```

因为 null 不表达失败原因。

---

## 10. ReviewService API

```ts
export interface IReviewService {
  readonly _serviceBrand: undefined;

  deriveAndReview(
    input: DeriveAndReviewInput,
  ): RawTableReviewRecord;

  reviewManualTemplate(
    input: ManualTemplateReviewRequest,
  ): ManualTemplateReviewResult;

  confirmCandidate(
    input: ConfirmCandidateInput,
  ): ManualTemplateReviewResult;
}
```

`ReviewService` 是 review decision owner，但实现不能变成 god service。
它不读取 rows，不解释 RecipeProjection，不 materialize Template。

内部必须拆纯函数：

```txt
reviewPipeline.ts
templateReviewer.ts
reviewSelectionPolicy.ts
reviewRecordBuilder.ts
reviewFingerprint.ts
```

`reviewService.ts` 只做：

```txt
读取 materialized candidates / review inputs
调用 pure pipeline
提交 Session
发事件
```

---

## 11. Candidate detail snapshot guard

非 selected candidate 不默认保存 full Template body。

需要展开详情时，由 Template materializer 根据 fingerprint 重新物化：

```ts
export type TemplateDraftDetailResult =
  | {
      readonly kind: "matched";
      readonly draft: TemplateDraft;
    }
  | {
      readonly kind: "staleSnapshot";
      readonly expected: {
        readonly recipeFingerprint: string;
        readonly userTemplateEffectiveFingerprint: string;
      };
      readonly actual: {
        readonly recipeFingerprint: string;
        readonly userTemplateEffectiveFingerprint: string;
      };
    }
  | {
      readonly kind: "notFound";
      readonly candidateId: string;
    };
```

规则：

```txt
selectedReviewedTemplate:
  保存完整 Template snapshot，可用于历史展示和 SliceRun 审计。

non-selected candidate:
  只保存 TemplateCandidateSummary。
  若要展示详情，必须 fingerprint 匹配才能 rematerialize。
  fingerprint 不匹配时，UI 显示“该候选来自旧规则/旧用户模板，需重新 Review”。
```

---

## 12. ReviewPolicyVersion

只要下列规则变化，必须 bump `reviewPolicyVersion`：

```txt
ready / needsManualAdjustment / invalid 阈值
systemRecommended / userActionRequired 阈值
candidate margin
critical diagnostics 分级
warning 是否允许系统应用
manual override 规则
userTemplate 优先级
recipe 优先级
conflict resolution 规则
```

建议类型：

```ts
export const REVIEW_POLICY_VERSION = 2;

export type ReviewSelectionPolicy = {
  readonly version: number;

  readonly readyThreshold: number;
  readonly systemRecommendedThreshold: number;
  readonly candidateMarginThreshold: number;

  readonly allowWarningsForSystemRecommended: boolean;
  readonly allowUserTemplateSystemRecommended: boolean;
  readonly allowRecipeSystemRecommended: boolean;

  readonly criticalDiagnosticCodes: readonly string[];
};
```

`REVIEW_POLICY_VERSION = 2` 起，`systemRecommended` 不再读取任何
retired apply 字段。Review 根据 materialized `TemplateReview`
confidence、diagnostics 和 Review policy 生成
`ReviewDecision.application`。

---

## 13. ReviewApplyContribution

目录：

```txt
src/cs/workbench/services/review/browser/reviewApply.contribution.ts
```

职责：

```txt
监听 reviewChanged
读取 RawTableReviewRecord.decision
如果 decision.kind === "ready"
且 decision.application.kind === "systemRecommended"
执行幂等 guard
创建 SliceRequest
调用 SliceService.submit
```

允许 guard：

```txt
同一 reviewSignature 是否已经提交过
同一 requestSignature 是否已经在 queue 中
同一 requestSignature 是否已有成功 SliceRun
当前 rawTableVersion 是否仍匹配
用户是否对该 raw table 设置了 run lock
session 是否仍存在该 raw table
```

禁止 guard：

```txt
confidence 是否够
candidate conflict 是否可接受
diagnostics 是否 critical
是否需要手动调整
是否允许系统应用
```

这些必须由 ReviewDecision 完成。

---

## 14. SliceRequest

SliceRequest 是 SliceService 的唯一执行输入。

```ts
export type SliceRequestTrigger =
  | {
      readonly kind: "reviewDecision";
      readonly reviewSignature: string;
      readonly submittedBy: "system";
    }
  | {
      readonly kind: "userCommand";
      readonly commandId?: string;
      readonly submittedBy: "user";
    }
  | {
      readonly kind: "batchCommand";
      readonly batchId: string;
      readonly submittedBy: "user";
    }
  | {
      readonly kind: "rerun";
      readonly previousRunId: string;
      readonly submittedBy: "user" | "system";
    };

export type SliceRequest = {
  readonly id: string;

  readonly ref: RawTableRef;
  readonly sourceRawTableVersion: number;

  readonly reviewedTemplate: ReviewedTemplate;

  readonly trigger: SliceRequestTrigger;

  readonly requestSignature: string;
  readonly createdAt: number;
};
```

`trigger` 用于：

```txt
audit
UI
dedupe
priority
latest user-run protection
debug
```

不用于：

```txt
SlicePlan 分支
SliceExecutor 分支
Template 解释
Review 判断
```

---

## 15. SliceService

统一 API：

```ts
export interface ISliceService {
  readonly _serviceBrand: undefined;

  submit(requests: readonly SliceRequest[]): void;

  prioritize(requestIds: readonly string[]): void;

  cancel(requestIds?: readonly string[]): void;
}
```

不允许新 API：

```txt
enqueueAuto
runManual
runUserTemplate
runRecipe
```

SlicePlanner / SliceExecutor 不读取 trigger。

---

## 16. SliceRun

```ts
export type SliceRun = {
  readonly id: string;
  readonly requestId: string;

  readonly fileId: string;
  readonly rawTableId: string;

  readonly sourceRawTableVersion: number;

  readonly reviewedTemplateFingerprint: string;
  readonly templateFingerprint: string;

  readonly requestSignature: string;
  readonly reviewSignature?: string;

  readonly trigger: SliceRequestTrigger;

  readonly planFingerprint: string;
  readonly sliceEngineVersion: number;
  readonly status: SliceRunStatus;

  readonly outputs: SliceRunOutputs;
  readonly diagnostics: readonly SliceDiagnostic[];

  readonly createdAt: number;
};
```

`trigger` 只用于审计/UI，不影响执行算法。

---

## 17. Explorer 状态合成

Explorer 订阅：

```txt
reviewChanged
sliceRunChanged
sliceQueueChanged
```

但只做 projection，不做业务决策。

推荐文件：

```txt
src/cs/workbench/contrib/explorer/browser/rawTableStatusProjection.ts
```

类型：

```ts
export type RawTableReviewUiState =
  | "readySystemRecommended"
  | "readyUserActionRequired"
  | "needsManualAdjustment"
  | "invalid"
  | "reviewPending"
  | "reviewStale";

export type RawTableSliceUiState =
  | "notRun"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "stale";

export type RawTableExplorerStatus = {
  readonly review: RawTableReviewUiState;
  readonly slice: RawTableSliceUiState;
  readonly primaryMessage: string;
  readonly actions: readonly ExplorerAction[];
};
```

Explorer 可合成：

```txt
Review ready + Slice running
Review ready + Slice succeeded
Review needsAdjustment + old succeeded run
Review invalid + stale old run
```

但不能自己判断：

```txt
confidence 是否够
candidate 是否冲突
是否应该系统应用
是否可手动执行
```

---

## 18. Event 链路

### Import

```txt
Files import
  -> Session.commitFileImport
  -> rawTablesChanged
```

### Template TableFacts

```txt
rawTablesChanged / schemaProfileChanged / tableFactsEngineChanged
  -> TableFacts queue
  -> table-fact producer
     (IRawTableFactsService)
  -> Session.commitRawTableFacts
  -> tableFactsChanged
```

### Template materialization

```txt
tableFactsChanged / recipeChanged / userTemplateChanged
  -> Template materializer
  -> TemplateCandidate / TemplateDraft
```

### Review

```txt
templateCandidatesChanged / reviewPolicyChanged
  -> ReviewContribution
  -> ReviewService.deriveAndReview
  -> Session.commitRawTableReviews
  -> reviewChanged
```

### Explorer

```txt
reviewChanged / sliceRunChanged / sliceQueueChanged
  -> Explorer recomputes RawTableExplorerStatus
```

### ReviewApply

```txt
reviewChanged
  -> ReviewApplyContribution
  -> if decision.ready + application.systemRecommended
  -> idempotency guard
  -> SliceRequest(trigger = reviewDecision)
  -> SliceService.submit
```

### Manual command

```txt
user command
  -> ReviewService.reviewManualTemplate
  -> if result.ready
  -> SliceRequest(trigger = userCommand)
  -> SliceService.submit
```

### Slice

```txt
SliceService.submit
  -> SlicePlan
  -> TS/Rust executor
  -> Session.commitSliceRuns
  -> sliceRunChanged
```

---

## 19. Staleness

### TableFacts

```txt
sourceRawTableVersion same
tableFactEngineVersion same
schemaProfileVersion same
semanticLexiconVersion same
raw table health signature same
```

### RawTableReviewRecord

```txt
templateCandidateSignature same
recipeFingerprint same
userTemplateEffectiveFingerprint same
reviewEngineVersion same
reviewPolicyVersion same
```

### SliceRequest

Common:

```txt
sourceRawTableVersion same
reviewedTemplate.templateFingerprint same
requestSignature same
```

If trigger.kind === "reviewDecision":

```txt
reviewSignature same
```

If trigger.kind === "userCommand":

```txt
templateFingerprint same
sourceRawTableVersion same
```

---

## 20. Rust 分工

Rust 不做：

```txt
ReviewDecision
ReviewPolicy
Recipe selector
UserTemplate catalog
Template candidate selection
Template config inference
systemRecommended/userActionRequired decision
Session commit
UI state
```

Rust 做：

```txt
P0: executeSlicePlan
P1: import prepare / row summary
P2: column numeric profile descriptor
P3: partial table-fact descriptor
P4: full table-fact descriptor
```

Rust stdio worker 的 `processFile` 只执行明确 Template config。验证/bench 脚本如需
生成处理输入，也必须走：

```txt
prepareImportBatch
  -> TS TableFacts + Recipe/UserTemplate Template materializer
  -> processFile
```

不得恢复 `processFileAuto` 或从 raw rows 直接推断 process config 的脚本旁路。

最终：

```txt
ReviewDecision ready/systemRecommended
  -> ReviewApplyContribution creates SliceRequest
  -> SlicePlanner creates SlicePlan
  -> Rust executeSlicePlan
  -> TS normalizes SliceCommit
  -> Session.commitSliceRuns
```

---

## 21. 完整目录结构

### 21.1 services/template

```txt
src/cs/workbench/services/template/
  common/
    templateSpec.ts
    templateCodec.ts
    templateValidation.ts
    templateFingerprint.ts
    templateRange.ts
    tableFacts.ts
    templateDraft.ts
    automaticTemplateMaterializer.ts
    recipeSelectorEvaluator.ts
    recipeTemplateMaterializer.ts
    userTemplateMaterializer.ts
    templateApplyPresetAdapter.ts
```

### 21.2 services/userTemplate

```txt
src/cs/workbench/services/userTemplate/
  common/
    userTemplate.ts
    userTemplateSnapshot.ts
    userTemplateCodec.ts
    userTemplateFingerprint.ts
    userTemplateEvents.ts
    userTemplateStorage.ts
  browser/
    userTemplateService.ts
    userTemplateStoreService.ts
    userTemplate.contribution.ts
```

### 21.3 contrib/userTemplate

```txt
src/cs/workbench/contrib/userTemplate/
  browser/
    userTemplateView.ts
    userTemplateTree.ts
    userTemplateEditor.ts
    userTemplateCommands.ts
    userTemplateActions.ts
    userTemplateDragAndDrop.ts
    userTemplate.contribution.ts
```

### 21.4 services/review

```txt
src/cs/workbench/services/review/
  common/
    review.ts
  browser/
    reviewService.ts
    review.contribution.ts
    reviewApply.contribution.ts
```

### 21.5 contrib/review

```txt
src/cs/workbench/contrib/review/
  browser/
    reviewPane.ts
    reviewCandidateList.ts
    reviewDiagnostics.ts
    reviewDecisionView.ts
    reviewCommands.ts
    reviewActions.ts
    review.contribution.ts
```

### 21.6 services/slice

```txt
src/cs/workbench/services/slice/
  common/
    sliceRequest.ts
    sliceRun.ts
    slice.ts
    slicePlanner.ts
    sliceExecutor.ts
    sliceFingerprint.ts
  browser/
    sliceService.ts
    sliceQueue.ts
    slicePriority.contribution.ts
```

### 21.7 services/tableFacts

正式 TableFacts 合同、helper、browser 实现位于：

```txt
src/cs/workbench/services/tableFacts/
  common/
    tableFacts.ts
    tableFactsRecord.ts
    rawTableStructure.ts
    columnProfile.ts
    layoutCandidate.ts
    semanticCandidate.ts
    measurement.ts
    diagnostics.ts
    blockDetector.ts
    importTableFactsSeedHeuristics.ts
    schemaProfileTableFacts.ts
  browser/
    importTableFactsSeed.ts
    rawTableFactsEngine.ts
    rawTableFactsService.ts
    rawTableFactsQueueService.ts
    rawTableFacts.contribution.ts
```

语义收缩为：

```txt
TableFacts == raw-table structure/profile/semantic/block facts
TableFacts != Template materializer
TableFacts != Review
TableFacts != primary execution domain
```

TableFacts 产出 structure、profiles、semantic candidates、blocks、
diagnostics 和 table-fact signature；不得产出 TemplateDraft、ReviewedTemplate、
ReviewDecision、systemRecommended 或 SliceRequest。

长期迁移目标：

```txt
table facts service contracts -> src/cs/workbench/services/tableFacts/common/tableFacts.ts
table facts record factories/helpers -> src/cs/workbench/services/tableFacts/common/*
table facts browser implementation -> src/cs/workbench/services/tableFacts/browser/*
canonical table-facts record projection helpers -> src/cs/workbench/services/tableFacts/common/tableFacts.ts
materializers -> src/cs/workbench/services/template/common/*Materializer*
```

### 21.8 contrib/explorer

新增/调整：

```txt
src/cs/workbench/contrib/explorer/browser/
  rawTableStatusProjection.ts
```

---

## 22. 迁移计划

### Phase 1 — ReviewDecision 完整落地

```txt
1. 新增 reviewDecision.ts。
2. RawTableReviewRecord 增加 decision。
3. 删除 autoSliceAllowed / applyRecommendation。
4. decision.ready 携带 reviewedTemplate。
5. decision.ready.application 决定 systemRecommended / userActionRequired。
```

验收：

```txt
ReviewRecord 是 Explorer 和 ReviewApply 的唯一模板状态来源。
```

### Phase 2 — ManualTemplateReviewResult

```txt
1. reviewManualTemplate 返回 ManualTemplateReviewResult。
2. UI 展示 needsManualAdjustment / invalid 原因。
3. 只有 ready 才创建 SliceRequest。
4. 用户 override 走 confirmCandidate。
```

验收：

```txt
手动模板失败原因可见。
```

### Phase 3 — ReviewApply guard 收缩

```txt
1. ReviewApplyContribution 只读 decision.application。
2. 增加 idempotency guard。
3. 禁止在 ReviewApply 中计算 confidence/diagnostics/candidate margin。
```

验收：

```txt
ReviewApply 不是决策层。
```

### Phase 4 — SliceRequest 统一

```txt
1. 新增 SliceRequest。
2. SliceService.submit 作为唯一执行入口。
3. SliceRun 记录 trigger。
4. 删除 enqueueAuto/runManual/runUserTemplate 类 API。
```

验收：

```txt
SliceService API 不含 auto/manual。
```

### Phase 5 — Candidate detail snapshot guard

```txt
1. Template materializer 提供 materializeCandidateDetails。
2. fingerprint 不匹配时返回 staleSnapshot。
3. UI 显示候选来自旧规则/旧用户模板，需要重新物化并 Review。
```

验收：

```txt
非 selected candidate 的详情不会错误重建。
```

### Phase 6 — Explorer projection

```txt
1. 新增 rawTableStatusProjection.ts。
2. Explorer 从 ReviewRecord + SliceRun 合成状态。
3. Explorer 不自己判断 ReviewPolicy。
```

验收：

```txt
Explorer 状态来自 projection，不散落在 UI 组件里。
```

### Phase 7 — Template materializer 与 ReviewService 拆纯函数

```txt
1. services/template/common/automaticTemplateMaterializer.ts。
2. services/template/common/recipeTemplateMaterializer.ts。
3. services/template/common/userTemplateMaterializer.ts。
4. services/template/common/recipeSelectorEvaluator.ts。
5. services/review/common/reviewPipeline.ts。
6. services/review/common/templateReviewer.ts。
7. services/review/common/reviewSelectionPolicy.ts。
8. services/review/common/reviewRecordBuilder.ts。
9. reviewService.ts 只做 review orchestration。
```

验收：

```txt
Template materialization 不留在 Review；ReviewService 不变成 god service。
```

### Phase 8 — UserTemplate 独立 domain

```txt
1. 新增 services/userTemplate。
2. 新增 contrib/userTemplate。
3. services/template 拥有 core Template spec + materializers。
4. Template materializer 通过 UserTemplateSnapshot 消费用户模板。
```

验收：

```txt
Review 不管理 UserTemplate catalog。
```

### Phase 9 — Retired table-fact fields

```txt
1. 旧 table-fact import/persistence record 经 createRawTableFactsFromRecord(...) 清洗。
2. TableFacts 只产出 table facts，不创建 optional review。
3. 目标记录是 RawTableFactsRecord；不要保留旧 record 名作为迁移别名。
4. 禁止把带旧决策字段的 retired record 直接透传成 TableFacts。
```

验收：

```txt
旧字段不会污染 table facts。
```

### Phase 10 — Rust executeSlicePlan

```txt
1. 稳定 SlicePlan schema。
2. Rust 新增 executeSlicePlan。
3. TS/Rust parity tests。
4. 大文件切片切换到 Rust executor。
```

---

## 23. 测试计划

### ReviewDecision tests

```txt
high confidence + no warnings -> ready/systemRecommended
ready but user confirmation needed -> ready/userActionRequired
candidate conflict -> needsManualAdjustment
critical diagnostics -> invalid
policy threshold change -> reviewPolicyVersion invalidates record
```

### Manual review tests

```txt
manual userTemplate valid -> ManualTemplateReviewResult.ready
manual inline valid -> ready
manual range invalid -> invalid with diagnostics
manual ambiguous -> needsManualAdjustment
override records userOverride
```

### ReviewApply tests

```txt
ready/systemRecommended -> SliceRequest submitted
ready/userActionRequired -> no SliceRequest
needsManualAdjustment -> no SliceRequest
invalid -> no SliceRequest
duplicate reviewSignature -> no duplicate submit
existing successful requestSignature -> no duplicate submit
ReviewApply does not inspect confidence
```

### Candidate detail tests

```txt
matching snapshot -> materialize candidate detail
recipe fingerprint mismatch -> staleSnapshot
userTemplate fingerprint mismatch -> staleSnapshot
candidateId missing -> notFound
selectedReviewedTemplate remains displayable without rematerialization
```

### Explorer projection tests

```txt
ready + running -> shows running
ready + succeeded -> shows ready/succeeded
needsManualAdjustment + old succeeded run -> shows adjustment required + stale old run
invalid + old run -> shows invalid + old run stale
```

### Slice boundary tests

```txt
SliceService only exposes submit
SlicePlanner does not inspect trigger
SliceExecutor does not inspect trigger
SliceRun records trigger
Slice output independent of trigger
```

### UserTemplate tests

```txt
create/update/delete/import/export
snapshot fingerprint changes
review reruns on userTemplateChanged
contrib/userTemplate does not compute ReviewDecision
```

### Retired-field migration tests

```txt
retired table-fact import with template fields -> createRawTableFactsFromRecord drops template fields
new table facts have no review fields
```

---

## 24. 最终验收标准

```txt
1. ReviewDecision 是模板可用性和系统应用建议的唯一来源。
2. ReviewDecision 使用 application.systemRecommended / userActionRequired。
3. Explorer 订阅 ReviewRecord，并与 SliceRun 合成展示状态。
4. Explorer 不做 ReviewPolicy 判断。
5. ReviewApplyContribution 只做 idempotency guard + SliceRequest submit。
6. Manual review 返回结构化 result，不返回 null。
7. Candidate detail rematerialization 由 Template materializer 执行，并有 snapshot guard。
8. UserTemplate 独立为 services/userTemplate + contrib/userTemplate。
9. services/template 拥有 core Template spec 和 TableFacts + Recipe/UserTemplate materializers。
10. SliceService 只有 submit(SliceRequest[])。
11. SlicePlanner/SliceExecutor 不读取 trigger。
12. SliceRun 记录 trigger 只用于审计/UI。
13. ReviewedTemplate.source 不包含 manual/auto。
14. manual/user/system 来源只在 SliceRequest.trigger 中。
15. Retired table-fact imports 通过 createRawTableFactsFromRecord 清洗为 table facts，不能让旧决策字段污染 RawTableFactsRecord。
16. ReviewService 内部只保留 review 纯函数，不拥有 Recipe materialization。
17. ReviewPolicyVersion 覆盖所有 decision 规则。
18. TemplateResolution 已退场；不要保留或恢复旧摘要记录桥。
```

---

## 25. v013 核心决策

```txt
1. v012 不是完整替代版，v013 才是完整替代版。
2. 保留 v011 的完整领域结构。
3. 合并 v012 的实现级收紧。
4. Review 仍然是决策中心。
5. ReviewApply 仍然只是幂等提交桥。
6. Slice 仍然只执行 SliceRequest。
7. Explorer 合成展示，不做业务判断。
8. UserTemplate 独立成 domain。
9. Retired table-fact imports 用正式 record factory 清洗，并向 Template table-fact/materializer ownership 迁移。
