/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  type CreateTableModelInput,
  ITableModelProducerService,
  type ITableModelProducerService as ITableModelProducerServiceType,
  type ImportTableModelSeed,
  type TableModelFileInput,
  type TableModelRecord,
  type TableModelRows,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import {
  createImportTableModelSeedFromFile,
  createImportTableModelSeedFromRows,
} from "src/cs/workbench/services/tableModel/browser/importTableModelSeed";
import { TableModelEngine } from "src/cs/workbench/services/tableModel/browser/tableModelEngine";
import {
  ISchemaProfileService,
  type ISchemaProfileService as ISchemaProfileServiceType,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export class TableModelProducerService extends Disposable implements ITableModelProducerServiceType {
  public declare readonly _serviceBrand: undefined;
  private readonly tableModelEngine = new TableModelEngine();

  public constructor(
    @ISchemaProfileService private readonly schemaProfileService?: ISchemaProfileServiceType,
  ) {
    super();
  }

  public createImportTableModelSeedFromFile(file: TableModelFileInput): Promise<ImportTableModelSeed> {
    return createImportTableModelSeedFromFile(file);
  }

  public createImportTableModelSeedFromRows(
    fileName: string,
    rows: TableModelRows,
  ): Promise<ImportTableModelSeed> {
    return createImportTableModelSeedFromRows(fileName, rows);
  }

  public async getOrCreate(
    input: CreateTableModelInput,
  ): Promise<TableModelRecord> {
    const schemaProfileSnapshot = this.schemaProfileService?.getSnapshot();
    const schemaProfiles = input.schemaProfiles ?? schemaProfileSnapshot?.profiles ?? [];
    return this.tableModelEngine.assess({
      ...input,
      schemaProfiles,
      schemaProfileVersion: input.schemaProfileVersion ?? schemaProfileSnapshot?.version ?? 0,
    });
  }

}

registerSingleton(
  ITableModelProducerService,
  TableModelProducerService as unknown as new (...services: BrandedService[]) => ITableModelProducerServiceType,
  InstantiationType.Delayed,
);
