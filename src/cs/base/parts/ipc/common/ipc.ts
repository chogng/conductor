import { CancellationError, CancellationToken, CancellationTokenSource } from "../../../common/async.js";
import { Emitter, Event } from "../../../common/event.js";
import { DisposableStore, type IDisposable, toDisposable } from "../../../common/lifecycle.js";
import {
    DefaultURITransformer,
    transformAndReviveIncomingURIs,
    transformOutgoingURIs,
} from "../../../common/uriIpc.js";

export interface IChannel {
    call<T>(command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<T>;
    listen<T>(event: string, arg?: unknown): Event<T>;
}

export interface IServerChannel<TContext = string> {
    call<T>(ctx: TContext, command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<T>;
    listen<T>(ctx: TContext, event: string, arg?: unknown): Event<T>;
}

export interface IMessagePassingProtocol {
    send(message: Uint8Array): void;
    readonly onMessage: Event<Uint8Array>;
    drain?(): Promise<void>;
}

export interface IChannelServer<TContext = string> {
    registerChannel(channelName: string, channel: IServerChannel<TContext>): void;
}

export interface IChannelClient {
    getChannel<T extends IChannel>(channelName: string): T;
}

export interface Client<TContext> {
    readonly ctx: TContext;
}

export interface IConnectionHub<TContext> {
    readonly connections: Connection<TContext>[];
    readonly onDidAddConnection: Event<Connection<TContext>>;
    readonly onDidRemoveConnection: Event<Connection<TContext>>;
}

export interface IClientRouter<TContext = string> {
    routeCall(hub: IConnectionHub<TContext>, command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<Client<TContext>>;
    routeEvent(hub: IConnectionHub<TContext>, event: string, arg?: unknown): Promise<Client<TContext>>;
}

export interface IRoutingChannelClient<TContext = string> {
    getChannel<T extends IChannel>(channelName: string, router: IClientRouter<TContext> | ((client: Client<TContext>) => boolean)): T;
}

export const enum RequestInitiator {
    LocalSide = 0,
    OtherSide = 1,
}

export interface IIPCLogger {
    logIncoming(messageLength: number, requestId: number, initiator: RequestInitiator, message: string, data?: unknown): void;
    logOutgoing(messageLength: number, requestId: number, initiator: RequestInitiator, message: string, data?: unknown): void;
}

const enum RequestType {
    Call = "call",
    Cancel = "cancel",
    Listen = "listen",
    Dispose = "dispose",
}

const enum ResponseType {
    Ready = "ready",
    Success = "success",
    Error = "error",
    Event = "event",
}

type RequestMessage =
    | { readonly type: RequestType.Call; readonly id: number; readonly channelName: string; readonly name: string; readonly arg?: unknown }
    | { readonly type: RequestType.Cancel; readonly id: number }
    | { readonly type: RequestType.Listen; readonly id: number; readonly channelName: string; readonly name: string; readonly arg?: unknown }
    | { readonly type: RequestType.Dispose; readonly id: number };

type ResponseMessage =
    | { readonly type: ResponseType.Ready }
    | { readonly type: ResponseType.Success; readonly id: number; readonly data: unknown }
    | { readonly type: ResponseType.Error; readonly id: number; readonly error: SerializedError }
    | { readonly type: ResponseType.Event; readonly id: number; readonly data: unknown };

interface SerializedError {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
}

export interface ClientConnectionEvent {
    readonly protocol: IMessagePassingProtocol;
    readonly onDidClientDisconnect: Event<void>;
}

export interface Connection<TContext> extends Client<TContext> {
    readonly channelServer: ChannelServer<TContext>;
    readonly channelClient: ChannelClient;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeMessage(message: RequestMessage | ResponseMessage | unknown): Uint8Array {
    return encoder.encode(JSON.stringify(transformOutgoingURIs(message, DefaultURITransformer)));
}

function decodeMessage<T>(message: Uint8Array): T {
    return transformAndReviveIncomingURIs(
        JSON.parse(decoder.decode(message)) as T,
        DefaultURITransformer,
    );
}

function serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
    }

    return { name: "Error", message: String(error) };
}

function reviveError(error: SerializedError): Error {
    const result = new Error(error.message);
    result.name = error.name;
    result.stack = error.stack;
    return result;
}

function eventToPromise<T>(event: Event<T>): Promise<T> {
    return new Promise(resolve => Event.once(event)(resolve));
}

export class ChannelServer<TContext = string> implements IChannelServer<TContext>, IDisposable {
    private readonly channels = new Map<string, IServerChannel<TContext>>();
    private readonly activeRequests = new Map<number, IDisposable>();
    private readonly protocolListener: IDisposable;

    constructor(
        private readonly protocol: IMessagePassingProtocol,
        private readonly ctx: TContext,
        private readonly logger: IIPCLogger | null = null,
    ) {
        this.protocolListener = this.protocol.onMessage(message => this.onMessage(message));
        this.sendResponse({ type: ResponseType.Ready });
    }

    public registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
        this.channels.set(channelName, channel);
    }

    private onMessage(message: Uint8Array): void {
        const request = decodeMessage<RequestMessage>(message);
        this.logger?.logIncoming(message.byteLength, request.id, RequestInitiator.OtherSide, request.type, request);

        switch (request.type) {
            case RequestType.Call:
                this.onCall(request);
                return;
            case RequestType.Listen:
                this.onListen(request);
                return;
            case RequestType.Cancel:
            case RequestType.Dispose:
                this.disposeRequest(request.id);
                return;
        }
    }

    private onCall(request: Extract<RequestMessage, { readonly type: RequestType.Call }>): void {
        const channel = this.channels.get(request.channelName);

        if (!channel) {
            this.sendResponse({ type: ResponseType.Error, id: request.id, error: { name: "Error", message: `Unknown channel: ${request.channelName}` } });
            return;
        }

        const source = new CancellationTokenSource();
        this.activeRequests.set(request.id, toDisposable(() => source.cancel()));

        Promise.resolve(channel.call(this.ctx, request.name, request.arg, source.token)).then(data => {
            this.sendResponse({ type: ResponseType.Success, id: request.id, data });
        }, error => {
            this.sendResponse({ type: ResponseType.Error, id: request.id, error: serializeError(error) });
        }).finally(() => {
            source.dispose();
            this.activeRequests.delete(request.id);
        });
    }

    private onListen(request: Extract<RequestMessage, { readonly type: RequestType.Listen }>): void {
        const channel = this.channels.get(request.channelName);

        if (!channel) {
            this.sendResponse({ type: ResponseType.Error, id: request.id, error: { name: "Error", message: `Unknown channel: ${request.channelName}` } });
            return;
        }

        const disposable = channel.listen(this.ctx, request.name, request.arg)(data => {
            this.sendResponse({ type: ResponseType.Event, id: request.id, data });
        });

        this.activeRequests.set(request.id, disposable);
    }

    private disposeRequest(id: number): void {
        this.activeRequests.get(id)?.dispose();
        this.activeRequests.delete(id);
    }

    private sendResponse(response: ResponseMessage): void {
        const message = encodeMessage(response);
        this.protocol.send(message);
        this.logger?.logOutgoing(message.byteLength, "id" in response ? response.id : 0, RequestInitiator.OtherSide, response.type, response);
    }

    public dispose(): void {
        this.protocolListener.dispose();
        for (const disposable of this.activeRequests.values()) {
            disposable.dispose();
        }
        this.activeRequests.clear();
    }
}

export class ChannelClient implements IChannelClient, IDisposable {
    private readonly handlers = new Map<number, (response: ResponseMessage) => void>();
    private readonly activeRequests = new Set<IDisposable>();
    private readonly protocolListener: IDisposable;
    private readonly onDidInitializeEmitter = new Emitter<void>();
    private lastRequestId = 0;
    private isInitialized = false;
    private isDisposed = false;

    public readonly onDidInitialize = this.onDidInitializeEmitter.event;

    constructor(
        private readonly protocol: IMessagePassingProtocol,
        private readonly logger: IIPCLogger | null = null,
    ) {
        this.protocolListener = this.protocol.onMessage(message => this.onMessage(message));
    }

    public getChannel<T extends IChannel>(channelName: string): T {
        return {
            call: <R>(command: string, arg?: unknown, cancellationToken?: CancellationToken) => this.request<R>(channelName, command, arg, cancellationToken),
            listen: <R>(event: string, arg?: unknown) => this.listen<R>(channelName, event, arg),
        } as T;
    }

    private request<T>(channelName: string, name: string, arg?: unknown, cancellationToken = CancellationToken.None): Promise<T> {
        if (this.isDisposed || cancellationToken.isCancellationRequested) {
            return Promise.reject(new CancellationError());
        }

        const id = this.lastRequestId++;
        const request: RequestMessage = { type: RequestType.Call, id, channelName, name, arg };

        return new Promise<T>((resolve, reject) => {
            const cancellation = cancellationToken.onCancellationRequested(() => {
                this.send({ type: RequestType.Cancel, id });
                this.handlers.delete(id);
                reject(new CancellationError());
            });

            this.activeRequests.add(cancellation);
            this.handlers.set(id, response => {
                cancellation.dispose();
                this.activeRequests.delete(cancellation);
                this.handlers.delete(id);

                if (response.type === ResponseType.Success) {
                    resolve(response.data as T);
                    return;
                }

                if (response.type === ResponseType.Error) {
                    reject(reviveError(response.error));
                    return;
                }

                reject(new Error(`Unexpected IPC response: ${response.type}`));
            });

            this.sendWhenInitialized(request);
        });
    }

    private listen<T>(channelName: string, name: string, arg?: unknown): Event<T> {
        return (listener, thisArgs, disposables) => {
            if (this.isDisposed) {
                return toDisposable(() => undefined);
            }

            const id = this.lastRequestId++;
            const request: RequestMessage = { type: RequestType.Listen, id, channelName, name, arg };
            const disposable = toDisposable(() => {
                this.handlers.delete(id);
                this.send({ type: RequestType.Dispose, id });
            });

            this.handlers.set(id, response => {
                if (response.type === ResponseType.Event) {
                    listener.call(thisArgs, response.data as T);
                }
            });

            this.sendWhenInitialized(request);

            if (Array.isArray(disposables)) {
                disposables.push(disposable);
            }
            else {
                disposables?.add(disposable);
            }

            return disposable;
        };
    }

    private sendWhenInitialized(message: RequestMessage): void {
        if (this.isInitialized) {
            this.send(message);
            return;
        }

        Event.once(this.onDidInitialize)(() => this.send(message));
    }

    private send(message: RequestMessage): void {
        const data = encodeMessage(message);
        this.protocol.send(data);
        this.logger?.logOutgoing(data.byteLength, message.id, RequestInitiator.LocalSide, message.type, message);
    }

    private onMessage(message: Uint8Array): void {
        const response = decodeMessage<ResponseMessage>(message);
        this.logger?.logIncoming(message.byteLength, "id" in response ? response.id : 0, RequestInitiator.LocalSide, response.type, response);

        if (response.type === ResponseType.Ready) {
            this.isInitialized = true;
            this.onDidInitializeEmitter.fire();
            return;
        }

        this.handlers.get(response.id)?.(response);
    }

    public dispose(): void {
        this.isDisposed = true;
        this.protocolListener.dispose();
        this.onDidInitializeEmitter.dispose();

        for (const disposable of this.activeRequests) {
            disposable.dispose();
        }

        this.activeRequests.clear();
        this.handlers.clear();
    }
}

export class IPCServer<TContext = string> implements IChannelServer<TContext>, IRoutingChannelClient<TContext>, IConnectionHub<TContext>, IDisposable {
    private readonly channels = new Map<string, IServerChannel<TContext>>();
    private readonly connectionSet = new Set<Connection<TContext>>();
    private readonly onDidAddConnectionEmitter = new Emitter<Connection<TContext>>();
    private readonly onDidRemoveConnectionEmitter = new Emitter<Connection<TContext>>();
    private readonly disposables = new DisposableStore();

    public readonly onDidAddConnection = this.onDidAddConnectionEmitter.event;
    public readonly onDidRemoveConnection = this.onDidRemoveConnectionEmitter.event;

    public get connections(): Connection<TContext>[] {
        return Array.from(this.connectionSet);
    }

    constructor(onDidClientConnect: Event<ClientConnectionEvent>, private readonly ipcLogger: IIPCLogger | null = null) {
        this.disposables.add(onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
            const disposable = Event.once(protocol.onMessage)(message => {
                const ctx = decodeMessage<TContext>(message);
                const channelServer = new ChannelServer(protocol, ctx, this.ipcLogger);
                const channelClient = new ChannelClient(protocol, this.ipcLogger);

                for (const [name, channel] of this.channels) {
                    channelServer.registerChannel(name, channel);
                }

                const connection: Connection<TContext> = { ctx, channelServer, channelClient };
                this.connectionSet.add(connection);
                this.onDidAddConnectionEmitter.fire(connection);

                this.disposables.add(onDidClientDisconnect(() => {
                    channelServer.dispose();
                    channelClient.dispose();
                    this.connectionSet.delete(connection);
                    this.onDidRemoveConnectionEmitter.fire(connection);
                }));
            });

            this.disposables.add(disposable);
        }));
    }

    public registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
        this.channels.set(channelName, channel);

        for (const connection of this.connectionSet) {
            connection.channelServer.registerChannel(channelName, channel);
        }
    }

    public getChannel<T extends IChannel>(channelName: string, routerOrClientFilter: IClientRouter<TContext> | ((client: Client<TContext>) => boolean)): T {
        return {
            call: async <R>(command: string, arg?: unknown, cancellationToken?: CancellationToken): Promise<R> => {
                const connection = await this.resolveConnection(routerOrClientFilter, command, arg, cancellationToken);
                return connection.channelClient.getChannel<IChannel>(channelName).call<R>(command, arg, cancellationToken);
            },
            listen: <R>(event: string, arg?: unknown): Event<R> => listener => {
                const store = new DisposableStore();

                this.resolveEventConnection(routerOrClientFilter, event, arg).then(connection => {
                    store.add(connection.channelClient.getChannel<IChannel>(channelName).listen<R>(event, arg)(listener));
                });

                return store;
            },
        } as T;
    }

    private async resolveConnection(
        routerOrClientFilter: IClientRouter<TContext> | ((client: Client<TContext>) => boolean),
        command: string,
        arg?: unknown,
        cancellationToken?: CancellationToken,
    ): Promise<Connection<TContext>> {
        if (typeof routerOrClientFilter === "function") {
            const connection = this.connections.find(routerOrClientFilter);

            if (connection) {
                return connection;
            }

            return eventToPromise(Event.filter(this.onDidAddConnection, routerOrClientFilter)) as Promise<Connection<TContext>>;
        }

        return routerOrClientFilter.routeCall(this, command, arg, cancellationToken) as Promise<Connection<TContext>>;
    }

    private async resolveEventConnection(
        routerOrClientFilter: IClientRouter<TContext> | ((client: Client<TContext>) => boolean),
        event: string,
        arg?: unknown,
    ): Promise<Connection<TContext>> {
        if (typeof routerOrClientFilter === "function") {
            const connection = this.connections.find(routerOrClientFilter);

            if (connection) {
                return connection;
            }

            return eventToPromise(Event.filter(this.onDidAddConnection, routerOrClientFilter)) as Promise<Connection<TContext>>;
        }

        return routerOrClientFilter.routeEvent(this, event, arg) as Promise<Connection<TContext>>;
    }

    public dispose(): void {
        this.disposables.dispose();

        for (const connection of this.connectionSet) {
            connection.channelClient.dispose();
            connection.channelServer.dispose();
        }

        this.connectionSet.clear();
        this.channels.clear();
        this.onDidAddConnectionEmitter.dispose();
        this.onDidRemoveConnectionEmitter.dispose();
    }
}

export class IPCClient<TContext = string> implements IChannelClient, IChannelServer<TContext>, IDisposable {
    private readonly channelClient: ChannelClient;
    private readonly channelServer: ChannelServer<TContext>;

    constructor(protocol: IMessagePassingProtocol, ctx: TContext, ipcLogger: IIPCLogger | null = null) {
        protocol.send(encodeMessage(ctx));
        this.channelClient = new ChannelClient(protocol, ipcLogger);
        this.channelServer = new ChannelServer(protocol, ctx, ipcLogger);
    }

    public getChannel<T extends IChannel>(channelName: string): T {
        return this.channelClient.getChannel<T>(channelName);
    }

    public registerChannel(channelName: string, channel: IServerChannel<TContext>): void {
        this.channelServer.registerChannel(channelName, channel);
    }

    public dispose(): void {
        this.channelClient.dispose();
        this.channelServer.dispose();
    }
}

export function getDelayedChannel<T extends IChannel>(promise: Promise<T>): T {
    return {
        call: <R>(command: string, arg?: unknown, cancellationToken?: CancellationToken) => promise.then(channel => channel.call<R>(command, arg, cancellationToken)),
        listen: <R>(event: string, arg?: unknown): Event<R> => (listener, thisArgs, disposables) => {
            const store = new DisposableStore();
            promise.then(channel => store.add(channel.listen<R>(event, arg)(listener, thisArgs)));

            if (Array.isArray(disposables)) {
                disposables.push(store);
            }
            else {
                disposables?.add(store);
            }

            return store;
        },
    } as T;
}

export function getNextTickChannel<T extends IChannel>(channel: T): T {
    return getDelayedChannel(Promise.resolve().then(() => channel));
}

export class StaticRouter<TContext = string> implements IClientRouter<TContext> {
    constructor(private readonly predicate: (ctx: TContext) => boolean | Promise<boolean>) {}

    public routeCall(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
        return this.route(hub);
    }

    public routeEvent(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
        return this.route(hub);
    }

    private async route(hub: IConnectionHub<TContext>): Promise<Client<TContext>> {
        for (const connection of hub.connections) {
            if (await this.predicate(connection.ctx)) {
                return connection;
            }
        }

        await eventToPromise(hub.onDidAddConnection);
        return this.route(hub);
    }
}
