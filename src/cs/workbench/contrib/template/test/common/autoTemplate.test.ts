import assert from "assert";

import {
  AUTO_TEMPLATE_ID,
  isAutoTemplateConfig,
  isAutoTemplateId,
} from "../../common/autoTemplate.ts";

suite("workbench/contrib/template/test/common/autoTemplate", () => {
  test("auto template id is only the special auto extraction option", () => {
    assert.equal(AUTO_TEMPLATE_ID, "__auto__");
    assert.equal(isAutoTemplateId("__auto__"), true);
    assert.equal(isAutoTemplateId("user-template"), false);
    assert.equal(isAutoTemplateId(null), false);
  });

  test("auto template config is marked by auto extraction mode", () => {
    assert.equal(isAutoTemplateConfig({ autoExtractionMode: true }), true);
    assert.equal(isAutoTemplateConfig({ autoExtractionMode: false }), false);
    assert.equal(isAutoTemplateConfig({}), false);
  });
});
