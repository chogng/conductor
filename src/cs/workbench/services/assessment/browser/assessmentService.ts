/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  IAssessmentService,
  type AssessmentFileInput,
  type AssessmentRows,
  type AssessRawTableInput,
  type IAssessmentService as IAssessmentServiceType,
  type ImportAssessmentSeed,
  type RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  createImportAssessmentSeedFromFile,
  createImportAssessmentSeedFromRows,
} from "src/cs/workbench/services/assessment/browser/importAssessmentSeed";
import { RawTableAssessmentEngine } from "src/cs/workbench/services/assessment/browser/rawTableAssessmentEngine";
import {
  ISchemaProfileService,
  type ISchemaProfileService as ISchemaProfileServiceType,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export class AssessmentService extends Disposable implements IAssessmentServiceType {
  public declare readonly _serviceBrand: undefined;
  private readonly rawTableAssessmentEngine = new RawTableAssessmentEngine();

  public constructor(
    @ISchemaProfileService private readonly schemaProfileService?: ISchemaProfileServiceType,
  ) {
    super();
  }

  public createImportAssessmentSeedFromFile(file: AssessmentFileInput): Promise<ImportAssessmentSeed> {
    return createImportAssessmentSeedFromFile(file);
  }

  public createImportAssessmentSeedFromRows(
    fileName: string,
    rows: AssessmentRows,
  ): Promise<ImportAssessmentSeed> {
    return createImportAssessmentSeedFromRows(fileName, rows);
  }

  public async assessRawTable(
    input: AssessRawTableInput,
  ): Promise<RawTableAssessmentRecord> {
    const schemaProfileSnapshot = this.schemaProfileService?.getSnapshot();
    const schemaProfiles = input.schemaProfiles ?? schemaProfileSnapshot?.profiles ?? [];
    return this.rawTableAssessmentEngine.assess({
      ...input,
      schemaProfiles,
      schemaProfileVersion: input.schemaProfileVersion ?? schemaProfileSnapshot?.version ?? 0,
    });
  }
}

registerSingleton(
  IAssessmentService,
  AssessmentService as unknown as new (...services: BrandedService[]) => IAssessmentServiceType,
  InstantiationType.Delayed,
);
