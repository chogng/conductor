# plan_v013 — 完整版：Files / RawTableEvidence / Recipe / UserTemplate / ReviewDecision / Explorer / SliceRequest / Slice 架构方案

> 版本定位：`plan_v011` 的完整内容 + `plan_v012` 的实现级修正。  
> 说明：`plan_v012` 写成了 delta patch，作为完整方案不够完整。`plan_v013` 是完整替代版。
>
> 核心原则：
>
> 1. Files 提供 raw table 原始事实。
> 2. RawTableEvidence 从 raw rows 派生测量证据。
> 3. Recipe 和 UserTemplate 只是 TemplateDraft 候选来源。
> 4. Review 是模板可用性、手动调整建议、系统应用建议的唯一决策层。
> 5. Explorer 订阅 ReviewRecord，并与 SliceRun 状态合成 UI 状态。
> 6. ReviewApplyContribution 只做幂等提交桥接，不做模板质量判断。
> 7. Slice 只执行统一 SliceRequest，不区分 auto/manual。
> 8. UserTemplate 独立为 services/userTemplate + contrib/userTemplate。
> 9. Template provenance 和 execution trigger 分离。
> 10. 旧 Assessment 必须拆为 RawTableEvidence + Review，不能简单 alias。
> 11. Recipe/UserTemplate candidate provider 归 Review；TemplateResolution 只可作为旧记录兼容 bridge 消费 Review-owned draft provider。

---

## 1. 最终主链路

```txt
Files
  -> RawTableRecord

RawTableEvidence
  -> RawTableEvidenceRecord

RecipeService
  -> RecipeSnapshot

UserTemplateService
  -> UserTemplateSnapshot

ReviewService
  -> TemplateDraft[]
  -> TemplateCandidateSummary[]
  -> TemplateReview[]
  -> ReviewDecision
  -> RawTableReviewRecord

Explorer
  -> ReviewRecord + SliceRun + SliceQueue
  -> RawTableExplorerStatus

ReviewApplyContribution
  -> ReviewDecision.application.systemRecommended
  -> idempotency guard
  -> SliceRequest

SliceService
  -> SliceRequest
  -> SlicePlan
  -> TS/Rust Executor
  -> SliceRun

Session
  -> canonical ledger
```

架构图：

```txt
Files
  |
  v
RawTableEvidence
  |
  v
ReviewService <--------- RecipeService
  |           <--------- UserTemplateService
  |
  v
Session.commitRawTableReviews
  |
  +--> Explorer
  |      ReviewRecord + SliceRun -> UI status
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

手动路径：

```txt
contrib/review or contrib/userTemplate
  -> user selects template
  -> ReviewService.reviewManualTemplate
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

### 2.2 RawTableEvidence

RawTableEvidence 是 measurement evidence owner。

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
不解释 Recipe
不生成 ReviewDecision
不判断能否系统应用
不创建 SliceRequest
不执行 Slice
```

### 2.3 Recipe

Recipe 是系统规则候选数据来源。`Recipe` 本身不生成 Template；
Review-owned candidate provider 解释 `RecipeSelector` / `RecipeProjection`。

```txt
Recipe + RawTableEvidence -> TemplateDraft
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
Review-owned candidate provider 根据 `UserTemplateSnapshot` 和
`RawTableEvidence` 产生 draft。

```txt
UserTemplateSnapshot + RawTableEvidence -> TemplateDraft
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
收集 TemplateDraft
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

## 3. 原 Assessment 的拆分

原先 `assessment` 实际混了两类能力：

```txt
1. raw table / column / semantic / block analysis
2. selected template / confidence / can auto apply / needs user action
```

v013 拆分为：

```txt
RawTableEvidence:
  第 1 类。

Review:
  第 2 类。
```

不要简单写：

```ts
export type RawTableAssessmentRecord = RawTableEvidenceRecord;
```

因为旧 record 可能还有：

```txt
decision
autoApplyAllowed
templateCandidates
selectedTemplate
recipeFingerprint
```

这些字段不属于 RawTableEvidence。

必须使用 adapter：

```txt
legacyAssessmentRecord
  -> RawTableEvidenceRecord
  -> optional legacy RawTableReviewRecord
```

推荐文件：

```txt
src/cs/workbench/services/assessment/common/legacyAssessmentAdapter.ts
```

示例：

```ts
export function extractEvidenceFromLegacyAssessment(
  record: RawTableAssessmentRecord,
): RawTableEvidenceRecord {
  return {
    fileId: record.fileId,
    rawTableId: record.rawTableId,
    sourceRawTableVersion: record.sourceRawTableVersion,
    evidenceEngineVersion: record.assessmentRuleVersion,
    schemaProfileVersion: record.schemaProfileVersion,
    semanticLexiconVersion: record.semanticLexiconVersion ?? 1,
    structure: record.structure,
    columnProfiles: record.columnProfiles,
    layoutCandidates: record.layoutCandidates,
    semanticCandidates: record.semanticCandidates,
    blocks: record.blocks,
    diagnostics: record.diagnostics,
    createdAt: record.createdAt,
  };
}
```

---

## 4. Core Template

`Template` 是 executable spec shape。

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

`services/template` 只保留 core Template 能力：

```txt
templateSpec.ts
templateCodec.ts
templateValidation.ts
templateFingerprint.ts
templateRange.ts
templateLegacyAdapter.ts
```

不负责：

```txt
UserTemplate catalog
Review
Slice
Recipe
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

`TemplateDraft` 是 Review pipeline 内部完整候选对象，不默认持久化。

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

  materializeCandidateDetails(
    input: MaterializeCandidateDetailsInput,
  ): TemplateDraftDetailResult;
}
```

`ReviewService` 是 owner，但实现不能变成 god service。

内部必须拆纯函数：

```txt
reviewPipeline.ts
automaticTemplateDraftProvider.ts
recipeTemplateDraftProvider.ts
userTemplateDraftProvider.ts
templateReviewer.ts
reviewSelectionPolicy.ts
reviewRecordBuilder.ts
reviewFingerprint.ts
```

`reviewService.ts` 只做：

```txt
读取 snapshots
调用 pure pipeline
提交 Session
发事件
```

---

## 11. Candidate detail snapshot guard

非 selected candidate 不默认保存 full Template body。

需要展开详情时：

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
export const REVIEW_POLICY_VERSION = 1;

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

### Evidence

```txt
rawTablesChanged / schemaProfileChanged / evidenceEngineChanged
  -> RawTableEvidenceQueue
  -> RawTableEvidenceService.build
  -> Session.commitRawTableEvidences
  -> evidenceChanged
```

### Review

```txt
evidenceChanged / recipeChanged / userTemplateChanged / reviewPolicyChanged
  -> ReviewQueue
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

### RawTableEvidence

```txt
sourceRawTableVersion same
evidenceEngineVersion same
schemaProfileVersion same
semanticLexiconVersion same
raw table health signature same
```

### RawTableReviewRecord

```txt
evidenceSignature same
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
systemRecommended/userActionRequired decision
Session commit
UI state
```

Rust 做：

```txt
P0: executeSlicePlan
P1: import prepare / row summary
P2: column numeric profile descriptor
P3: partial RawTableEvidence descriptor
P4: full RawTableEvidence descriptor
```

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
    templateLegacyAdapter.ts
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
    userTemplateImportExportService.ts
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
    templateCandidate.ts
    templateDraft.ts
    templateReview.ts
    reviewedTemplate.ts
    reviewDecision.ts
    manualTemplateReview.ts
    automaticTemplateDraftProvider.ts
    recipeSelectorEvaluator.ts
    recipeTemplateDraftProvider.ts
    userTemplateDraftProvider.ts
    templateReviewer.ts
    reviewSelectionPolicy.ts
    reviewRecordBuilder.ts
    reviewFingerprint.ts
  browser/
    reviewService.ts
    reviewQueueService.ts
    reviewApply.contribution.ts
    review.contribution.ts
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

### 21.7 services/assessment

短期保留：

```txt
src/cs/workbench/services/assessment/
  common/
    assessment.ts
    rawTableStructure.ts
    columnProfile.ts
    layoutCandidate.ts
    semanticCandidate.ts
    measurement.ts
    legacyAssessmentAdapter.ts
  browser/
    assessmentService.ts
    assessmentQueueService.ts
```

语义收缩为：

```txt
assessment == RawTableEvidence
```

长期迁移：

```txt
src/cs/workbench/services/evidence/
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
1. materializeCandidateDetails 返回 TemplateDraftDetailResult。
2. fingerprint 不匹配时返回 staleSnapshot。
3. UI 显示候选来自旧 Review，需要重新 Review。
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

### Phase 7 — ReviewService 拆纯函数

```txt
1. reviewPipeline.ts。
2. automaticTemplateDraftProvider.ts。
3. recipeTemplateDraftProvider.ts。
4. userTemplateDraftProvider.ts。
5. templateReviewer.ts。
6. reviewSelectionPolicy.ts。
7. reviewRecordBuilder.ts。
8. reviewService.ts 只做 orchestration。
```

验收：

```txt
ReviewService 不变成 god service。
```

### Phase 8 — UserTemplate 独立 domain

```txt
1. 新增 services/userTemplate。
2. 新增 contrib/userTemplate。
3. services/template 收缩为 core Template spec。
4. Review 通过 UserTemplateSnapshot 消费用户模板。
```

验收：

```txt
Review 不管理 UserTemplate catalog。
```

### Phase 9 — Legacy adapter

```txt
1. 新增 legacyAssessmentAdapter.ts。
2. 旧 assessment record 映射成 evidence/review。
3. 禁止 RawTableAssessmentRecord = RawTableEvidenceRecord 简单 alias。
```

验收：

```txt
旧字段不会污染 RawTableEvidence。
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

### Legacy migration tests

```txt
legacy assessment with template fields -> evidence adapter drops template fields
legacy selected template -> optional review adapter creates legacy review
new RawTableEvidence has no review fields
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
7. Candidate detail rematerialization 有 snapshot guard。
8. UserTemplate 独立为 services/userTemplate + contrib/userTemplate。
9. services/template 只保留 core Template spec。
10. SliceService 只有 submit(SliceRequest[])。
11. SlicePlanner/SliceExecutor 不读取 trigger。
12. SliceRun 记录 trigger 只用于审计/UI。
13. ReviewedTemplate.source 不包含 manual/auto。
14. manual/user/system 来源只在 SliceRequest.trigger 中。
15. Legacy Assessment 通过 adapter 拆为 Evidence/Review，不能简单 alias。
16. ReviewService 内部拆纯函数。
17. ReviewPolicyVersion 覆盖所有 decision 规则。
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
9. Legacy Assessment 用 adapter 拆分。
