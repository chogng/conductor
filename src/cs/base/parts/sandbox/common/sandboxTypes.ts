export interface ISandboxConfiguration {
    readonly windowId: number;
    readonly appRoot: string;
    readonly userEnv: Record<string, string | undefined>;
    readonly product: Record<string, unknown>;
    readonly zoomLevel?: number;
    readonly codeCachePath?: string;
    readonly nls: {
        readonly messages: string[];
        readonly language: string | undefined;
    };
    readonly cssModules?: string[];
}
