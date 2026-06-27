/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  FileId,
  SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  TableReviewResult,
} from "src/cs/workbench/services/review/common/reviewModel";

export type RawTableReviewRecord = TableReviewResult & {
  readonly fileId: FileId;
  readonly rawTableId: SheetId;
  readonly sourceRawTableVersion: number;
  readonly evidenceSignature: string;
  readonly createdAt: number;
};

export const createReviewRecordSignature = (
  record: Pick<
    RawTableReviewRecord,
    | "evidenceSignature"
    | "recipeFingerprint"
    | "reviewEngineVersion"
    | "reviewPolicyVersion"
    | "userTemplateCatalogVersion"
    | "userTemplateEffectiveFingerprint"
  >,
): string => JSON.stringify({
  evidenceSignature: record.evidenceSignature,
  recipeFingerprint: record.recipeFingerprint,
  userTemplateCatalogVersion: record.userTemplateCatalogVersion,
  userTemplateEffectiveFingerprint: record.userTemplateEffectiveFingerprint,
  reviewEngineVersion: record.reviewEngineVersion,
  reviewPolicyVersion: record.reviewPolicyVersion,
});
