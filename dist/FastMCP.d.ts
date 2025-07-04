import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { EventStore } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ResourceLink, Root, ClientCapabilities, GetPromptResult, CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
export { ResourceLink } from '@modelcontextprotocol/sdk/types.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { EventEmitter } from 'events';
import http from 'http';
import { StrictEventEmitter } from 'strict-event-emitter-types';
import { z } from 'zod';

type SSEServer = {
    close: () => Promise<void>;
};
type FastMCPEvents<T extends FastMCPSessionAuth> = {
    connect: (event: {
        session: FastMCPSession<T>;
    }) => void;
    disconnect: (event: {
        session: FastMCPSession<T>;
    }) => void;
};
type FastMCPSessionEvents = {
    error: (event: {
        error: Error;
    }) => void;
    ready: () => void;
    rootsChanged: (event: {
        roots: Root[];
    }) => void;
};
declare const imageContent: (input: {
    buffer: Buffer;
} | {
    path: string;
} | {
    url: string;
}) => Promise<ImageContent>;
declare const audioContent: (input: {
    buffer: Buffer;
} | {
    path: string;
} | {
    url: string;
}) => Promise<AudioContent>;
type Context<T extends FastMCPSessionAuth> = {
    log: {
        debug: (message: string, data?: SerializableValue) => void;
        error: (message: string, data?: SerializableValue) => void;
        info: (message: string, data?: SerializableValue) => void;
        warn: (message: string, data?: SerializableValue) => void;
    };
    reportProgress: (progress: Progress) => Promise<void>;
    session: T | undefined;
    streamContent: (content: Content | Content[]) => Promise<void>;
};
type Extra = unknown;
type Extras = Record<string, Extra>;
type Literal = boolean | null | number | string | undefined;
type Progress = {
    /**
     * The progress thus far. This should increase every time progress is made, even if the total is unknown.
     */
    progress: number;
    /**
     * Total number of items to process (or total progress required), if known.
     */
    total?: number;
};
type SerializableValue = {
    [key: string]: SerializableValue;
} | Literal | SerializableValue[];
type TextContent = {
    text: string;
    type: "text";
};
type ToolParameters = StandardSchemaV1;
declare abstract class FastMCPError extends Error {
    constructor(message?: string);
}
declare class UnexpectedStateError extends FastMCPError {
    extras?: Extras;
    constructor(message: string, extras?: Extras);
}
/**
 * An error that is meant to be surfaced to the user.
 */
declare class UserError extends UnexpectedStateError {
}
type ImageContent = {
    data: string;
    mimeType: string;
    type: "image";
};
type AudioContent = {
    data: string;
    mimeType: string;
    type: "audio";
};
type ResourceContent = {
    resource: {
        blob?: string;
        mimeType?: string;
        text?: string;
        uri: string;
    };
    type: "resource";
};
type Content = AudioContent | ImageContent | ResourceContent | ResourceLink | TextContent;
type ContentResult = {
    content: Content[];
    isError?: boolean;
};
type Completion = {
    hasMore?: boolean;
    total?: number;
    values: string[];
};
type ArgumentValueCompleter<T extends FastMCPSessionAuth = FastMCPSessionAuth> = (value: string, auth?: T) => Promise<Completion>;
type InputPrompt<T extends FastMCPSessionAuth = FastMCPSessionAuth, Arguments extends InputPromptArgument<T>[] = InputPromptArgument<T>[], Args = PromptArgumentsToObject<Arguments>> = {
    arguments?: InputPromptArgument<T>[];
    description?: string;
    load: (args: Args, auth?: T) => Promise<PromptResult>;
    name: string;
};
type InputPromptArgument<T extends FastMCPSessionAuth = FastMCPSessionAuth> = Readonly<{
    complete?: ArgumentValueCompleter<T>;
    description?: string;
    enum?: string[];
    name: string;
    required?: boolean;
}>;
type InputResourceTemplate<T extends FastMCPSessionAuth, Arguments extends InputResourceTemplateArgument<T>[] = InputResourceTemplateArgument<T>[]> = {
    arguments: Arguments;
    description?: string;
    load: (args: ResourceTemplateArgumentsToObject<Arguments>, auth?: T) => Promise<ResourceResult | ResourceResult[]>;
    mimeType?: string;
    name: string;
    uriTemplate: string;
};
type InputResourceTemplateArgument<T extends FastMCPSessionAuth = FastMCPSessionAuth> = Readonly<{
    complete?: ArgumentValueCompleter<T>;
    description?: string;
    name: string;
    required?: boolean;
}>;
type LoggingLevel = "alert" | "critical" | "debug" | "emergency" | "error" | "info" | "notice" | "warning";
type Prompt<T extends FastMCPSessionAuth = FastMCPSessionAuth, Arguments extends PromptArgument<T>[] = PromptArgument<T>[], Args = PromptArgumentsToObject<Arguments>> = {
    arguments?: PromptArgument<T>[];
    complete?: (name: string, value: string, auth?: T) => Promise<Completion>;
    description?: string;
    load: (args: Args, auth?: T) => Promise<PromptResult>;
    name: string;
};
type PromptArgument<T extends FastMCPSessionAuth = FastMCPSessionAuth> = Readonly<{
    complete?: ArgumentValueCompleter<T>;
    description?: string;
    enum?: string[];
    name: string;
    required?: boolean;
}>;
type PromptArgumentsToObject<T extends {
    name: string;
    required?: boolean;
}[]> = {
    [K in T[number]["name"]]: Extract<T[number], {
        name: K;
    }>["required"] extends true ? string : string | undefined;
};
type PromptResult = Pick<GetPromptResult, "messages"> | string;
type Resource<T extends FastMCPSessionAuth> = {
    complete?: (name: string, value: string, auth?: T) => Promise<Completion>;
    description?: string;
    load: (auth?: T) => Promise<ResourceResult | ResourceResult[]>;
    mimeType?: string;
    name: string;
    uri: string;
};
type ResourceResult = {
    blob: string;
    mimeType?: string;
    uri?: string;
} | {
    mimeType?: string;
    text: string;
    uri?: string;
};
type ResourceTemplate<T extends FastMCPSessionAuth, Arguments extends ResourceTemplateArgument<T>[] = ResourceTemplateArgument<T>[]> = {
    arguments: Arguments;
    complete?: (name: string, value: string, auth?: T) => Promise<Completion>;
    description?: string;
    load: (args: ResourceTemplateArgumentsToObject<Arguments>, auth?: T) => Promise<ResourceResult | ResourceResult[]>;
    mimeType?: string;
    name: string;
    uriTemplate: string;
};
type ResourceTemplateArgument<T extends FastMCPSessionAuth = FastMCPSessionAuth> = Readonly<{
    complete?: ArgumentValueCompleter<T>;
    description?: string;
    name: string;
    required?: boolean;
}>;
type ResourceTemplateArgumentsToObject<T extends {
    name: string;
}[]> = {
    [K in T[number]["name"]]: string;
};
type SamplingResponse = {
    content: AudioContent | ImageContent | TextContent;
    model: string;
    role: "assistant" | "user";
    stopReason?: "endTurn" | "maxTokens" | "stopSequence" | string;
};
type ServerOptions<T extends FastMCPSessionAuth> = {
    authenticate?: Authenticate<T>;
    /**
     * Configuration for the health-check endpoint that can be exposed when the
     * server is running using the HTTP Stream transport. When enabled, the
     * server will respond to an HTTP GET request with the configured path (by
     * default "/health") rendering a plain-text response (by default "ok") and
     * the configured status code (by default 200).
     *
     * The endpoint is only added when the server is started with
     * `transportType: "httpStream"` – it is ignored for the stdio transport.
     */
    health?: {
        /**
         * When set to `false` the health-check endpoint is disabled.
         * @default true
         */
        enabled?: boolean;
        /**
         * Plain-text body returned by the endpoint.
         * @default "ok"
         */
        message?: string;
        /**
         * HTTP path that should be handled.
         * @default "/health"
         */
        path?: string;
        /**
         * HTTP response status that will be returned.
         * @default 200
         */
        status?: number;
    };
    instructions?: string;
    name: string;
    /**
     * Configuration for OAuth well-known discovery endpoints that can be exposed
     * when the server is running using HTTP-based transports (SSE or HTTP Stream).
     * When enabled, the server will respond to requests for OAuth discovery endpoints
     * with the configured metadata.
     *
     * The endpoints are only added when the server is started with
     * `transportType: "httpStream"` – they are ignored for the stdio transport.
     * Both SSE and HTTP Stream transports support OAuth endpoints.
     */
    oauth?: {
        /**
         * OAuth Authorization Server metadata for /.well-known/oauth-authorization-server
         *
         * This endpoint follows RFC 8414 (OAuth 2.0 Authorization Server Metadata)
         * and provides metadata about the OAuth 2.0 authorization server.
         *
         * Required by MCP Specification 2025-03-26
         */
        authorizationServer?: {
            authorizationEndpoint: string;
            codeChallengeMethodsSupported?: string[];
            dpopSigningAlgValuesSupported?: string[];
            grantTypesSupported?: string[];
            introspectionEndpoint?: string;
            issuer: string;
            jwksUri?: string;
            opPolicyUri?: string;
            opTosUri?: string;
            registrationEndpoint?: string;
            responseModesSupported?: string[];
            responseTypesSupported: string[];
            revocationEndpoint?: string;
            scopesSupported?: string[];
            serviceDocumentation?: string;
            tokenEndpoint: string;
            tokenEndpointAuthMethodsSupported?: string[];
            tokenEndpointAuthSigningAlgValuesSupported?: string[];
            uiLocalesSupported?: string[];
        };
        /**
         * Whether OAuth discovery endpoints should be enabled.
         */
        enabled: boolean;
        /**
         * OAuth Protected Resource metadata for /.well-known/oauth-protected-resource
         *
         * This endpoint follows RFC 9470 (OAuth 2.0 Protected Resource Metadata)
         * and provides metadata about the OAuth 2.0 protected resource.
         *
         * Required by MCP Specification 2025-06-18
         */
        protectedResource?: {
            authorizationServers: string[];
            bearerMethodsSupported?: string[];
            jwksUri?: string;
            resource: string;
            resourceDocumentation?: string;
            resourcePolicyUri?: string;
        };
    };
    ping?: {
        /**
         * Whether ping should be enabled by default.
         * - true for SSE or HTTP Stream
         * - false for stdio
         */
        enabled?: boolean;
        /**
         * Interval
         * @default 5000 (5s)
         */
        intervalMs?: number;
        /**
         * Logging level for ping-related messages.
         * @default 'debug'
         */
        logLevel?: LoggingLevel;
    };
    /**
     * Configuration for roots capability
     */
    roots?: {
        /**
         * Whether roots capability should be enabled
         * Set to false to completely disable roots support
         * @default true
         */
        enabled?: boolean;
    };
    version: `${number}.${number}.${number}`;
};
type Tool<T extends FastMCPSessionAuth, Params extends ToolParameters = ToolParameters> = {
    annotations?: {
        /**
         * When true, the tool leverages incremental content streaming
         * Return void for tools that handle all their output via streaming
         */
        streamingHint?: boolean;
    } & ToolAnnotations;
    description?: string;
    execute: (args: StandardSchemaV1.InferOutput<Params>, context: Context<T>) => Promise<AudioContent | ContentResult | ImageContent | ResourceContent | ResourceLink | string | TextContent | void>;
    name: string;
    parameters?: Params;
    timeoutMs?: number;
};
/**
 * Tool annotations as defined in MCP Specification (2025-03-26)
 * These provide hints about a tool's behavior.
 */
type ToolAnnotations = {
    /**
     * If true, the tool may perform destructive updates
     * Only meaningful when readOnlyHint is false
     * @default true
     */
    destructiveHint?: boolean;
    /**
     * If true, calling the tool repeatedly with the same arguments has no additional effect
     * Only meaningful when readOnlyHint is false
     * @default false
     */
    idempotentHint?: boolean;
    /**
     * If true, the tool may interact with an "open world" of external entities
     * @default true
     */
    openWorldHint?: boolean;
    /**
     * If true, indicates the tool does not modify its environment
     * @default false
     */
    readOnlyHint?: boolean;
    /**
     * A human-readable title for the tool, useful for UI display
     */
    title?: string;
};
declare const FastMCPSessionEventEmitterBase: {
    new (): StrictEventEmitter<EventEmitter, FastMCPSessionEvents>;
};
type FastMCPSessionAuth = Record<string, unknown> | undefined;
declare class FastMCPSessionEventEmitter extends FastMCPSessionEventEmitterBase {
}
declare class FastMCPSession<T extends FastMCPSessionAuth = FastMCPSessionAuth> extends FastMCPSessionEventEmitter {
    #private;
    get clientCapabilities(): ClientCapabilities | null;
    get isReady(): boolean;
    get loggingLevel(): LoggingLevel;
    get roots(): Root[];
    get server(): Server;
    constructor({ auth, instructions, log, name, ping, prompts, resources, resourcesTemplates, roots, tools, transportType, version, }: {
        auth?: T;
        instructions?: string;
        log?: MyLogFn;
        name: string;
        ping?: ServerOptions<T>["ping"];
        prompts: Prompt<T>[];
        resources: Resource<T>[];
        resourcesTemplates: InputResourceTemplate<T>[];
        roots?: ServerOptions<T>["roots"];
        tools: Tool<T>[];
        transportType?: "httpStream" | "stdio";
        version: string;
    });
    close(): Promise<void>;
    connect(transport: Transport): Promise<void>;
    requestSampling(message: z.infer<typeof CreateMessageRequestSchema>["params"], options?: RequestOptions): Promise<SamplingResponse>;
    waitForReady(): Promise<void>;
    private addPrompt;
    private addResource;
    private addResourceTemplate;
    private log;
    private setupCompleteHandlers;
    private setupErrorHandling;
    private setupLoggingHandlers;
    private setupPromptHandlers;
    private setupResourceHandlers;
    private setupResourceTemplateHandlers;
    private setupRootsHandlers;
    private setupToolHandlers;
}
declare const FastMCPEventEmitterBase: {
    new (): StrictEventEmitter<EventEmitter, FastMCPEvents<FastMCPSessionAuth>>;
};
type Authenticate<T> = (request: http.IncomingMessage) => Promise<T>;
type MyLogFn = (level: "debug" | "error" | "info" | "warn", message: string, data: unknown) => void;
declare class FastMCPEventEmitter extends FastMCPEventEmitterBase {
}
declare class FastMCP<T extends FastMCPSessionAuth = FastMCPSessionAuth> extends FastMCPEventEmitter {
    #private;
    options: {
        log?: MyLogFn;
    } & ServerOptions<T>;
    get sessions(): FastMCPSession<T>[];
    constructor(options: {
        log?: MyLogFn;
    } & ServerOptions<T>);
    /**
     * Adds a prompt to the server.
     */
    addPrompt<const Args extends InputPromptArgument<T>[]>(prompt: InputPrompt<T, Args>): void;
    /**
     * Adds a resource to the server.
     */
    addResource(resource: Resource<T>): void;
    /**
     * Adds a resource template to the server.
     */
    addResourceTemplate<const Args extends InputResourceTemplateArgument[]>(resource: InputResourceTemplate<T, Args>): void;
    /**
     * Adds a tool to the server.
     */
    addTool<Params extends ToolParameters>(tool: Tool<T, Params>): void;
    /**
     * Embeds a resource by URI, making it easy to include resources in tool responses.
     *
     * @param uri - The URI of the resource to embed
     * @returns Promise<ResourceContent> - The embedded resource content
     */
    embedded(uri: string): Promise<ResourceContent["resource"]>;
    /**
     * Starts the server.
     */
    start(options?: Partial<{
        httpStream: {
            endpoint?: `/${string}`;
            eventStore?: EventStore;
            port: number;
        };
        transportType: "httpStream" | "stdio";
    }>): Promise<void>;
    /**
     * Stops the server.
     */
    stop(): Promise<void>;
}

export { type Content, type ContentResult, type Context, FastMCP, type FastMCPEvents, FastMCPSession, type FastMCPSessionEvents, type ImageContent, type InputPrompt, type InputPromptArgument, type LoggingLevel, type Progress, type Prompt, type PromptArgument, type Resource, type ResourceResult, type ResourceTemplate, type ResourceTemplateArgument, type SSEServer, type SerializableValue, type ServerOptions, type TextContent, type Tool, type ToolParameters, UnexpectedStateError, UserError, audioContent, imageContent };
