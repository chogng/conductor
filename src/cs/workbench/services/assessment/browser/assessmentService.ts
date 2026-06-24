/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  IRawTableFactsService,
  type CreateRawTableFactsInput,
  type IRawTableFactsService as IRawTableFactsServiceType,
  type ImportTableFactsSeed,
  type RawTableFactsFileInput,
  type RawTableFactsRecord,
  type RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
  createImportTableFactsSeedFromFile,
  createImportTableFactsSeedFromRows,
} from "src/cs/workbench/services/assessment/browser/importAssessmentSeed";
import { RawTableAssessmentEngine } from "src/cs/workbench/services/assessment/browser/rawTableAssessmentEngine";
import {
  ISchemaProfileService,
  type ISchemaProfileService as ISchemaProfileServiceType,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export class RawTableFactsService extends Disposable implements IRawTableFactsServiceType {
  public declare readonly _serviceBrand: undefined;
  private readonly rawTableAssessmentEngine = new RawTableAssessmentEngine();

  public constructor(
    @ISchemaProfileService private readonly schemaProfileService?: ISchemaProfileServiceType,
  ) {
    super();
  }

  public createImportTableFactsSeedFromFile(file: RawTableFactsFileInput): Promise<ImportTableFactsSeed> {
    return createImportTableFactsSeedFromFile(file);
  }

  public createImportTableFactsSeedFromRows(
    fileName: string,
    rows: RawTableFactsRows,
  ): Promise<ImportTableFactsSeed> {
    return createImportTableFactsSeedFromRows(fileName, rows);
  }

  public createImportAssessmentSeedFromFile(file: RawTableFactsFileInput): Promise<ImportTableFactsSeed> {
    return this.createImportTableFactsSeedFromFile(file);
  }

  public createImportAssessmentSeedFromRows(
    fileName: string,
    rows: RawTableFactsRows,
  ): Promise<ImportTableFactsSeed> {
    return this.createImportTableFactsSeedFromRows(fileName, rows);
  }

  public async createRawTableFacts(
    input: CreateRawTableFactsInput,
  ): Promise<RawTableFactsRecord> {
    const schemaProfileSnapshot = this.schemaProfileService?.getSnapshot();
    const schemaProfiles = input.schemaProfiles ?? schemaProfileSnapshot?.profiles ?? [];
    return this.rawTableAssessmentEngine.assess({
      ...input,
      schemaProfiles,
      schemaProfileVersion: input.schemaProfileVersion ?? schemaProfileSnapshot?.version ?? 0,
    });
  }

  public assessRawTable(input: CreateRawTableFactsInput): Promise<RawTableFactsRecord> {
    return this.createRawTableFacts(input);
  }
}

export { RawTableFactsService as AssessmentService };

registerSingleton(
  IRawTableFactsService,
  RawTableFactsService as unknown as new (...services: BrandedService[]) => IRawTableFactsServiceType,
  InstantiationType.Delayed,
);
