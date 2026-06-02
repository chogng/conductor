export {
  AUTO_TEMPLATE_CONFIG_FIELD,
  AUTO_TEMPLATE_ID,
  isAutoTemplateConfig,
  isAutoTemplateId,
} from "../../contrib/template/common/autoTemplate.ts";
export {
  buildAutoTemplateConfig,
  buildAutoWorkerConfig,
} from "../../contrib/template/common/autoTemplateConfig.ts";
export {
  createAutoTemplatePlan,
  inferAutoExtraction,
  inferMetadataGroupShapeFromRows,
} from "../../contrib/template/common/autoTemplatePlan.ts";
export type {
  AutoExtractionBlock,
  AutoExtractionPlan,
  AutoExtractionResult,
} from "../../contrib/template/common/autoTemplatePlan.ts";
