// src/FastMCP.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  RootsListChangedNotificationSchema,
  SetLevelRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";
import { readFile } from "fs/promises";
import Fuse from "fuse.js";
import { startHTTPServer } from "mcp-proxy";
import { setTimeout as delay } from "timers/promises";
import { fetch } from "undici";
import parseURITemplate from "uri-templates";
import { toJsonSchema } from "xsschema";
import { z } from "zod";
var imageContent = async (input) => {
  let rawData;
  try {
    if ("url" in input) {
      try {
        const response = await fetch(input.url);
        if (!response.ok) {
          throw new Error(
            `Server responded with status: ${response.status} - ${response.statusText}`
          );
        }
        rawData = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw new Error(
          `Failed to fetch image from URL (${input.url}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if ("path" in input) {
      try {
        rawData = await readFile(input.path);
      } catch (error) {
        throw new Error(
          `Failed to read image from path (${input.path}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if ("buffer" in input) {
      rawData = input.buffer;
    } else {
      throw new Error(
        "Invalid input: Provide a valid 'url', 'path', or 'buffer'"
      );
    }
    const { fileTypeFromBuffer } = await import("file-type");
    const mimeType = await fileTypeFromBuffer(rawData);
    if (!mimeType || !mimeType.mime.startsWith("image/")) {
      console.warn(
        `Warning: Content may not be a valid image. Detected MIME: ${mimeType?.mime || "unknown"}`
      );
    }
    const base64Data = rawData.toString("base64");
    return {
      data: base64Data,
      mimeType: mimeType?.mime ?? "image/png",
      type: "image"
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`Unexpected error processing image: ${String(error)}`);
    }
  }
};
var audioContent = async (input) => {
  let rawData;
  try {
    if ("url" in input) {
      try {
        const response = await fetch(input.url);
        if (!response.ok) {
          throw new Error(
            `Server responded with status: ${response.status} - ${response.statusText}`
          );
        }
        rawData = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw new Error(
          `Failed to fetch audio from URL (${input.url}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if ("path" in input) {
      try {
        rawData = await readFile(input.path);
      } catch (error) {
        throw new Error(
          `Failed to read audio from path (${input.path}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if ("buffer" in input) {
      rawData = input.buffer;
    } else {
      throw new Error(
        "Invalid input: Provide a valid 'url', 'path', or 'buffer'"
      );
    }
    const { fileTypeFromBuffer } = await import("file-type");
    const mimeType = await fileTypeFromBuffer(rawData);
    if (!mimeType || !mimeType.mime.startsWith("audio/")) {
      console.warn(
        `Warning: Content may not be a valid audio file. Detected MIME: ${mimeType?.mime || "unknown"}`
      );
    }
    const base64Data = rawData.toString("base64");
    return {
      data: base64Data,
      mimeType: mimeType?.mime ?? "audio/mpeg",
      type: "audio"
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`Unexpected error processing audio: ${String(error)}`);
    }
  }
};
var FastMCPError = class extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
};
var UnexpectedStateError = class extends FastMCPError {
  extras;
  constructor(message, extras) {
    super(message);
    this.name = new.target.name;
    this.extras = extras;
  }
};
var UserError = class extends UnexpectedStateError {
};
var TextContentZodSchema = z.object({
  /**
   * The text content of the message.
   */
  text: z.string(),
  type: z.literal("text")
}).strict();
var ImageContentZodSchema = z.object({
  /**
   * The base64-encoded image data.
   */
  data: z.string().base64(),
  /**
   * The MIME type of the image. Different providers may support different image types.
   */
  mimeType: z.string(),
  type: z.literal("image")
}).strict();
var AudioContentZodSchema = z.object({
  /**
   * The base64-encoded audio data.
   */
  data: z.string().base64(),
  mimeType: z.string(),
  type: z.literal("audio")
}).strict();
var ResourceContentZodSchema = z.object({
  resource: z.object({
    blob: z.string().optional(),
    mimeType: z.string().optional(),
    text: z.string().optional(),
    uri: z.string()
  }),
  type: z.literal("resource")
}).strict();
var ResourceLinkZodSchema = z.object({
  description: z.string().optional(),
  mimeType: z.string().optional(),
  name: z.string(),
  title: z.string().optional(),
  type: z.literal("resource_link"),
  uri: z.string()
});
var ContentZodSchema = z.discriminatedUnion("type", [
  TextContentZodSchema,
  ImageContentZodSchema,
  AudioContentZodSchema,
  ResourceContentZodSchema,
  ResourceLinkZodSchema
]);
var ContentResultZodSchema = z.object({
  content: ContentZodSchema.array(),
  isError: z.boolean().optional()
}).strict();
var CompletionZodSchema = z.object({
  /**
   * Indicates whether there are additional completion options beyond those provided in the current response, even if the exact total is unknown.
   */
  hasMore: z.optional(z.boolean()),
  /**
   * The total number of completion options available. This can exceed the number of values actually sent in the response.
   */
  total: z.optional(z.number().int()),
  /**
   * An array of completion values. Must not exceed 100 items.
   */
  values: z.array(z.string()).max(100)
});
var FastMCPSessionEventEmitterBase = EventEmitter;
var FastMCPSessionEventEmitter = class extends FastMCPSessionEventEmitterBase {
};
var FastMCPSession = class extends FastMCPSessionEventEmitter {
  get clientCapabilities() {
    return this.#clientCapabilities ?? null;
  }
  get isReady() {
    return this.#connectionState === "ready";
  }
  get loggingLevel() {
    return this.#loggingLevel;
  }
  get roots() {
    return this.#roots;
  }
  get server() {
    return this.#server;
  }
  #auth;
  #capabilities = {};
  #clientCapabilities;
  #connectionState = "connecting";
  #log;
  #loggingLevel = "info";
  #needsEventLoopFlush = false;
  #pingConfig;
  #pingInterval = null;
  #prompts = [];
  #resources = [];
  #resourceTemplates = [];
  #roots = [];
  #rootsConfig;
  #server;
  constructor({
    auth,
    instructions,
    log,
    name,
    ping,
    prompts,
    resources,
    resourcesTemplates,
    roots,
    tools,
    transportType,
    version
  }) {
    super();
    this.#auth = auth;
    this.#pingConfig = ping;
    this.#rootsConfig = roots;
    this.#needsEventLoopFlush = transportType === "httpStream";
    this.#log = log;
    if (tools.length) {
      this.#capabilities.tools = {};
    }
    if (resources.length || resourcesTemplates.length) {
      this.#capabilities.resources = {};
    }
    if (prompts.length) {
      for (const prompt of prompts) {
        this.addPrompt(prompt);
      }
      this.#capabilities.prompts = {};
    }
    this.#capabilities.logging = {};
    this.#server = new Server(
      { name, version },
      { capabilities: this.#capabilities, instructions }
    );
    this.setupErrorHandling();
    this.setupLoggingHandlers();
    this.setupRootsHandlers();
    this.setupCompleteHandlers();
    if (tools.length) {
      this.setupToolHandlers(tools);
    }
    if (resources.length || resourcesTemplates.length) {
      for (const resource of resources) {
        this.addResource(resource);
      }
      this.setupResourceHandlers(resources);
      if (resourcesTemplates.length) {
        for (const resourceTemplate of resourcesTemplates) {
          this.addResourceTemplate(resourceTemplate);
        }
        this.setupResourceTemplateHandlers(resourcesTemplates);
      }
    }
    if (prompts.length) {
      this.setupPromptHandlers(prompts);
    }
  }
  async close() {
    this.#connectionState = "closed";
    if (this.#pingInterval) {
      clearInterval(this.#pingInterval);
    }
    try {
      await this.#server.close();
    } catch (error) {
      console.error("[FastMCP error]", "could not close server", error);
    }
  }
  async connect(transport) {
    if (this.#server.transport) {
      throw new UnexpectedStateError("Server is already connected");
    }
    this.#connectionState = "connecting";
    try {
      await this.#server.connect(transport);
      let attempt = 0;
      const maxAttempts = 10;
      const retryDelay = 100;
      while (attempt++ < maxAttempts) {
        const capabilities = this.#server.getClientCapabilities();
        if (capabilities) {
          this.#clientCapabilities = capabilities;
          break;
        }
        await delay(retryDelay);
      }
      if (!this.#clientCapabilities) {
        console.warn(
          `[FastMCP warning] could not infer client capabilities after ${maxAttempts} attempts. Connection may be unstable.`
        );
      }
      if (this.#clientCapabilities?.roots?.listChanged && typeof this.#server.listRoots === "function") {
        try {
          const roots = await this.#server.listRoots();
          this.#roots = roots?.roots || [];
        } catch (e) {
          if (e instanceof McpError && e.code === ErrorCode.MethodNotFound) {
            console.debug(
              "[FastMCP debug] listRoots method not supported by client"
            );
          } else {
            console.error(
              `[FastMCP error] received error listing roots.

${e instanceof Error ? e.stack : JSON.stringify(e)}`
            );
          }
        }
      }
      if (this.#clientCapabilities) {
        const pingConfig = this.#getPingConfig(transport);
        if (pingConfig.enabled) {
          this.#pingInterval = setInterval(async () => {
            try {
              await this.#server.ping();
            } catch {
              const logLevel = pingConfig.logLevel;
              if (logLevel === "debug") {
                console.debug("[FastMCP debug] server ping failed");
              } else if (logLevel === "warning") {
                console.warn(
                  "[FastMCP warning] server is not responding to ping"
                );
              } else if (logLevel === "error") {
                console.error(
                  "[FastMCP error] server is not responding to ping"
                );
              } else {
                console.info("[FastMCP info] server ping failed");
              }
            }
          }, pingConfig.intervalMs);
        }
      }
      this.#connectionState = "ready";
      this.emit("ready");
    } catch (error) {
      this.#connectionState = "error";
      const errorEvent = {
        error: error instanceof Error ? error : new Error(String(error))
      };
      this.emit("error", errorEvent);
      throw error;
    }
  }
  async requestSampling(message, options) {
    return this.#server.createMessage(message, options);
  }
  waitForReady() {
    if (this.isReady) {
      return Promise.resolve();
    }
    if (this.#connectionState === "error" || this.#connectionState === "closed") {
      return Promise.reject(
        new Error(`Connection is in ${this.#connectionState} state`)
      );
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            "Connection timeout: Session failed to become ready within 5 seconds"
          )
        );
      }, 5e3);
      this.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.once("error", (event) => {
        clearTimeout(timeout);
        reject(event.error);
      });
    });
  }
  #getPingConfig(transport) {
    const pingConfig = this.#pingConfig || {};
    let defaultEnabled = false;
    if ("type" in transport) {
      if (transport.type === "httpStream") {
        defaultEnabled = true;
      }
    }
    return {
      enabled: pingConfig.enabled !== void 0 ? pingConfig.enabled : defaultEnabled,
      intervalMs: pingConfig.intervalMs || 5e3,
      logLevel: pingConfig.logLevel || "debug"
    };
  }
  addPrompt(inputPrompt) {
    const completers = {};
    const enums = {};
    const fuseInstances = {};
    for (const argument of inputPrompt.arguments ?? []) {
      if (argument.complete) {
        completers[argument.name] = argument.complete;
      }
      if (argument.enum) {
        enums[argument.name] = argument.enum;
        fuseInstances[argument.name] = new Fuse(argument.enum, {
          includeScore: true,
          threshold: 0.3
          // More flexible matching!
        });
      }
    }
    const prompt = {
      ...inputPrompt,
      complete: async (name, value, auth) => {
        if (completers[name]) {
          return await completers[name](value, auth);
        }
        if (fuseInstances[name]) {
          const result = fuseInstances[name].search(value);
          return {
            total: result.length,
            values: result.map((item) => item.item)
          };
        }
        return {
          values: []
        };
      }
    };
    this.#prompts.push(prompt);
  }
  addResource(inputResource) {
    this.#resources.push(inputResource);
  }
  addResourceTemplate(inputResourceTemplate) {
    const completers = {};
    for (const argument of inputResourceTemplate.arguments ?? []) {
      if (argument.complete) {
        completers[argument.name] = argument.complete;
      }
    }
    const resourceTemplate = {
      ...inputResourceTemplate,
      complete: async (name, value, auth) => {
        if (completers[name]) {
          return await completers[name](value, auth);
        }
        return {
          values: []
        };
      }
    };
    this.#resourceTemplates.push(resourceTemplate);
  }
  log(...args) {
    if (this.#log) {
      this.#log(...args);
    }
  }
  setupCompleteHandlers() {
    this.#server.setRequestHandler(CompleteRequestSchema, async (request) => {
      if (request.params.ref.type === "ref/prompt") {
        const prompt = this.#prompts.find(
          (prompt2) => prompt2.name === request.params.ref.name
        );
        if (!prompt) {
          throw new UnexpectedStateError("Unknown prompt", {
            request
          });
        }
        if (!prompt.complete) {
          throw new UnexpectedStateError("Prompt does not support completion", {
            request
          });
        }
        const completion = CompletionZodSchema.parse(
          await prompt.complete(
            request.params.argument.name,
            request.params.argument.value,
            this.#auth
          )
        );
        return {
          completion
        };
      }
      if (request.params.ref.type === "ref/resource") {
        const resource = this.#resourceTemplates.find(
          (resource2) => resource2.uriTemplate === request.params.ref.uri
        );
        if (!resource) {
          throw new UnexpectedStateError("Unknown resource", {
            request
          });
        }
        if (!("uriTemplate" in resource)) {
          throw new UnexpectedStateError("Unexpected resource");
        }
        if (!resource.complete) {
          throw new UnexpectedStateError(
            "Resource does not support completion",
            {
              request
            }
          );
        }
        const completion = CompletionZodSchema.parse(
          await resource.complete(
            request.params.argument.name,
            request.params.argument.value,
            this.#auth
          )
        );
        return {
          completion
        };
      }
      throw new UnexpectedStateError("Unexpected completion request", {
        request
      });
    });
  }
  setupErrorHandling() {
    this.#server.onerror = (error) => {
      console.error("[FastMCP error]", error);
    };
  }
  setupLoggingHandlers() {
    this.#server.setRequestHandler(SetLevelRequestSchema, (request) => {
      this.#loggingLevel = request.params.level;
      return {};
    });
  }
  setupPromptHandlers(prompts) {
    this.#server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: prompts.map((prompt) => {
          return {
            arguments: prompt.arguments,
            complete: prompt.complete,
            description: prompt.description,
            name: prompt.name
          };
        })
      };
    });
    this.#server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt = prompts.find(
        (prompt2) => prompt2.name === request.params.name
      );
      if (!prompt) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown prompt: ${request.params.name}`
        );
      }
      const args = request.params.arguments;
      for (const arg of prompt.arguments ?? []) {
        if (arg.required && !(args && arg.name in args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Prompt '${request.params.name}' requires argument '${arg.name}': ${arg.description || "No description provided"}`
          );
        }
      }
      let result;
      try {
        result = await prompt.load(
          args,
          this.#auth
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to load prompt '${request.params.name}': ${errorMessage}`
        );
      }
      if (typeof result === "string") {
        return {
          description: prompt.description,
          messages: [
            {
              content: { text: result, type: "text" },
              role: "user"
            }
          ]
        };
      } else {
        return {
          description: prompt.description,
          messages: result.messages
        };
      }
    });
  }
  setupResourceHandlers(resources) {
    this.#server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: resources.map((resource) => ({
          description: resource.description,
          mimeType: resource.mimeType,
          name: resource.name,
          uri: resource.uri
        }))
      };
    });
    this.#server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        if ("uri" in request.params) {
          const resource = resources.find(
            (resource2) => "uri" in resource2 && resource2.uri === request.params.uri
          );
          if (!resource) {
            for (const resourceTemplate of this.#resourceTemplates) {
              const uriTemplate = parseURITemplate(
                resourceTemplate.uriTemplate
              );
              const match = uriTemplate.fromUri(request.params.uri);
              if (!match) {
                continue;
              }
              const uri = uriTemplate.fill(match);
              const result = await resourceTemplate.load(match, this.#auth);
              const resources2 = Array.isArray(result) ? result : [result];
              return {
                contents: resources2.map((resource2) => ({
                  ...resource2,
                  description: resourceTemplate.description,
                  mimeType: resource2.mimeType ?? resourceTemplate.mimeType,
                  name: resourceTemplate.name,
                  uri: resource2.uri ?? uri
                }))
              };
            }
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Resource not found: '${request.params.uri}'. Available resources: ${resources.map((r) => r.uri).join(", ") || "none"}`
            );
          }
          if (!("uri" in resource)) {
            throw new UnexpectedStateError("Resource does not support reading");
          }
          let maybeArrayResult;
          try {
            maybeArrayResult = await resource.load(this.#auth);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to load resource '${resource.name}' (${resource.uri}): ${errorMessage}`,
              {
                uri: resource.uri
              }
            );
          }
          const resourceResults = Array.isArray(maybeArrayResult) ? maybeArrayResult : [maybeArrayResult];
          return {
            contents: resourceResults.map((result) => ({
              ...result,
              mimeType: result.mimeType ?? resource.mimeType,
              name: resource.name,
              uri: result.uri ?? resource.uri
            }))
          };
        }
        throw new UnexpectedStateError("Unknown resource request", {
          request
        });
      }
    );
  }
  setupResourceTemplateHandlers(resourceTemplates) {
    this.#server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => {
        return {
          resourceTemplates: resourceTemplates.map((resourceTemplate) => ({
            description: resourceTemplate.description,
            mimeType: resourceTemplate.mimeType,
            name: resourceTemplate.name,
            uriTemplate: resourceTemplate.uriTemplate
          }))
        };
      }
    );
  }
  setupRootsHandlers() {
    if (this.#rootsConfig?.enabled === false) {
      console.debug(
        "[FastMCP debug] roots capability explicitly disabled via config"
      );
      return;
    }
    if (typeof this.#server.listRoots === "function") {
      this.#server.setNotificationHandler(
        RootsListChangedNotificationSchema,
        () => {
          this.#server.listRoots().then((roots) => {
            this.#roots = roots.roots;
            this.emit("rootsChanged", {
              roots: roots.roots
            });
          }).catch((error) => {
            if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
              console.debug(
                "[FastMCP debug] listRoots method not supported by client"
              );
            } else {
              console.error("[FastMCP error] Error listing roots", error);
            }
          });
        }
      );
    } else {
      console.debug(
        "[FastMCP debug] roots capability not available, not setting up notification handler"
      );
    }
  }
  setupToolHandlers(tools) {
    this.#server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: await Promise.all(
          tools.map(async (tool) => {
            return {
              annotations: tool.annotations,
              description: tool.description,
              inputSchema: tool.parameters ? await toJsonSchema(tool.parameters) : {
                additionalProperties: false,
                properties: {},
                type: "object"
              },
              // More complete schema for Cursor compatibility
              name: tool.name
            };
          })
        )
      };
    });
    this.#server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = tools.find((tool2) => tool2.name === request.params.name);
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }
      let args = void 0;
      if (tool.parameters) {
        const parsed = await tool.parameters["~standard"].validate(
          request.params.arguments
        );
        if (parsed.issues) {
          this.log(
            "error",
            `tool:${request.params.name}: Parameters validation failed`,
            parsed.issues
          );
          const friendlyErrors = parsed.issues.map((issue) => {
            const path = issue.path?.join(".") || "root";
            return `${path}: ${issue.message}`;
          }).join(", ");
          throw new McpError(
            ErrorCode.InvalidParams,
            `Tool '${request.params.name}' parameter validation failed: ${friendlyErrors}. Please check the parameter types and values according to the tool's schema.`
          );
        }
        args = parsed.value;
      }
      const progressToken = request.params?._meta?.progressToken;
      let result;
      try {
        const reportProgress = async (progress) => {
          try {
            await this.#server.notification({
              method: "notifications/progress",
              params: {
                ...progress,
                progressToken
              }
            });
            if (this.#needsEventLoopFlush) {
              await new Promise((resolve) => setImmediate(resolve));
            }
          } catch (progressError) {
            console.warn(
              `[FastMCP warning] Failed to report progress for tool '${request.params.name}':`,
              progressError instanceof Error ? progressError.message : String(progressError)
            );
          }
        };
        const log = {
          debug: (message, context) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message
              },
              level: "debug"
            });
          },
          error: (message, context) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message
              },
              level: "error"
            });
          },
          info: (message, context) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message
              },
              level: "info"
            });
          },
          warn: (message, context) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message
              },
              level: "warning"
            });
          }
        };
        const streamContent = async (content) => {
          const contentArray = Array.isArray(content) ? content : [content];
          try {
            await this.#server.notification({
              method: "notifications/tool/streamContent",
              params: {
                content: contentArray,
                toolName: request.params.name
              }
            });
            if (this.#needsEventLoopFlush) {
              await new Promise((resolve) => setImmediate(resolve));
            }
          } catch (streamError) {
            console.warn(
              `[FastMCP warning] Failed to stream content for tool '${request.params.name}':`,
              streamError instanceof Error ? streamError.message : String(streamError)
            );
          }
        };
        const executeToolPromise = tool.execute(args, {
          log,
          reportProgress,
          session: this.#auth,
          streamContent
        });
        const maybeStringResult = await (tool.timeoutMs ? Promise.race([
          executeToolPromise,
          new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
              reject(
                new UserError(
                  `Tool '${request.params.name}' timed out after ${tool.timeoutMs}ms. Consider increasing timeoutMs or optimizing the tool implementation.`
                )
              );
            }, tool.timeoutMs);
            executeToolPromise.finally(() => clearTimeout(timeoutId));
          })
        ]) : executeToolPromise);
        await delay(1);
        if (maybeStringResult === void 0 || maybeStringResult === null) {
          result = ContentResultZodSchema.parse({
            content: []
          });
        } else if (typeof maybeStringResult === "string") {
          result = ContentResultZodSchema.parse({
            content: [{ text: maybeStringResult, type: "text" }]
          });
        } else if ("type" in maybeStringResult) {
          result = ContentResultZodSchema.parse({
            content: [maybeStringResult]
          });
        } else {
          result = ContentResultZodSchema.parse(maybeStringResult);
        }
      } catch (error) {
        if (error instanceof UserError) {
          return {
            content: [{ text: error.message, type: "text" }],
            isError: true
          };
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              text: `Tool '${request.params.name}' execution failed: ${errorMessage}`,
              type: "text"
            }
          ],
          isError: true
        };
      }
      return result;
    });
  }
};
function camelToSnakeCase(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function convertObjectToSnakeCase(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}
var FastMCPEventEmitterBase = EventEmitter;
var FastMCPEventEmitter = class extends FastMCPEventEmitterBase {
};
var FastMCP = class extends FastMCPEventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.#options = options;
    this.#authenticate = options.authenticate;
    this.#log = options.log;
  }
  get sessions() {
    return this.#sessions;
  }
  #authenticate;
  #httpStreamServer = null;
  #log;
  #options;
  #prompts = [];
  #resources = [];
  #resourcesTemplates = [];
  #sessions = [];
  #tools = [];
  /**
   * Adds a prompt to the server.
   */
  addPrompt(prompt) {
    this.#prompts.push(prompt);
  }
  /**
   * Adds a resource to the server.
   */
  addResource(resource) {
    this.#resources.push(resource);
  }
  /**
   * Adds a resource template to the server.
   */
  addResourceTemplate(resource) {
    this.#resourcesTemplates.push(resource);
  }
  /**
   * Adds a tool to the server.
   */
  addTool(tool) {
    this.#tools.push(tool);
  }
  /**
   * Embeds a resource by URI, making it easy to include resources in tool responses.
   *
   * @param uri - The URI of the resource to embed
   * @returns Promise<ResourceContent> - The embedded resource content
   */
  async embedded(uri) {
    const directResource = this.#resources.find(
      (resource) => resource.uri === uri
    );
    if (directResource) {
      const result = await directResource.load();
      const results = Array.isArray(result) ? result : [result];
      const firstResult = results[0];
      const resourceData = {
        mimeType: directResource.mimeType,
        uri
      };
      if ("text" in firstResult) {
        resourceData.text = firstResult.text;
      }
      if ("blob" in firstResult) {
        resourceData.blob = firstResult.blob;
      }
      return resourceData;
    }
    for (const template of this.#resourcesTemplates) {
      const templateBase = template.uriTemplate.split("{")[0];
      if (uri.startsWith(templateBase)) {
        const params = {};
        const templateParts = template.uriTemplate.split("/");
        const uriParts = uri.split("/");
        for (let i = 0; i < templateParts.length; i++) {
          const templatePart = templateParts[i];
          if (templatePart?.startsWith("{") && templatePart.endsWith("}")) {
            const paramName = templatePart.slice(1, -1);
            const paramValue = uriParts[i];
            if (paramValue) {
              params[paramName] = paramValue;
            }
          }
        }
        const result = await template.load(
          params
        );
        const resourceData = {
          mimeType: template.mimeType,
          uri
        };
        if ("text" in result) {
          resourceData.text = result.text;
        }
        if ("blob" in result) {
          resourceData.blob = result.blob;
        }
        return resourceData;
      }
    }
    throw new UnexpectedStateError(`Resource not found: ${uri}`, { uri });
  }
  /**
   * Starts the server.
   */
  async start(options) {
    const config = this.#parseRuntimeConfig(options);
    if (config.transportType === "stdio") {
      const transport = new StdioServerTransport();
      const session = new FastMCPSession({
        instructions: this.#options.instructions,
        log: this.#log,
        name: this.#options.name,
        ping: this.#options.ping,
        prompts: this.#prompts,
        resources: this.#resources,
        resourcesTemplates: this.#resourcesTemplates,
        roots: this.#options.roots,
        tools: this.#tools,
        transportType: "stdio",
        version: this.#options.version
      });
      await session.connect(transport);
      this.#sessions.push(session);
      this.emit("connect", {
        session
      });
    } else if (config.transportType === "httpStream") {
      const httpConfig = config.httpStream;
      this.#httpStreamServer = await startHTTPServer({
        createServer: async (request) => {
          let auth;
          if (this.#authenticate) {
            auth = await this.#authenticate(request);
          }
          return new FastMCPSession({
            auth,
            log: this.#log,
            name: this.#options.name,
            ping: this.#options.ping,
            prompts: this.#prompts,
            resources: this.#resources,
            resourcesTemplates: this.#resourcesTemplates,
            roots: this.#options.roots,
            tools: this.#tools,
            transportType: "httpStream",
            version: this.#options.version
          });
        },
        eventStore: httpConfig.eventStore,
        onClose: async (session) => {
          this.emit("disconnect", {
            session
          });
        },
        onConnect: async (session) => {
          this.#sessions.push(session);
          console.info(`[FastMCP info] HTTP Stream session established`);
          this.emit("connect", {
            session
          });
        },
        onUnhandledRequest: async (req, res) => {
          const healthConfig = this.#options.health ?? {};
          const enabled = healthConfig.enabled === void 0 ? true : healthConfig.enabled;
          if (enabled) {
            const path = healthConfig.path ?? "/health";
            const url = new URL(req.url || "", "http://localhost");
            try {
              if (req.method === "GET" && url.pathname === path) {
                res.writeHead(healthConfig.status ?? 200, {
                  "Content-Type": "text/plain"
                }).end(healthConfig.message ?? "\u2713 Ok");
                return;
              }
              if (req.method === "GET" && url.pathname === "/ready") {
                const readySessions = this.#sessions.filter(
                  (s) => s.isReady
                ).length;
                const totalSessions = this.#sessions.length;
                const allReady = readySessions === totalSessions && totalSessions > 0;
                const response = {
                  ready: readySessions,
                  status: allReady ? "ready" : totalSessions === 0 ? "no_sessions" : "initializing",
                  total: totalSessions
                };
                res.writeHead(allReady ? 200 : 503, {
                  "Content-Type": "application/json"
                }).end(JSON.stringify(response));
                return;
              }
            } catch (error) {
              console.error("[FastMCP error] health endpoint error", error);
            }
          }
          const oauthConfig = this.#options.oauth;
          if (oauthConfig?.enabled && req.method === "GET") {
            const url = new URL(req.url || "", "http://localhost");
            if (url.pathname === "/.well-known/oauth-authorization-server" && oauthConfig.authorizationServer) {
              const metadata = convertObjectToSnakeCase(
                oauthConfig.authorizationServer
              );
              res.writeHead(200, {
                "Content-Type": "application/json"
              }).end(JSON.stringify(metadata));
              return;
            }
            if (url.pathname === "/.well-known/oauth-protected-resource" && oauthConfig.protectedResource) {
              const metadata = convertObjectToSnakeCase(
                oauthConfig.protectedResource
              );
              res.writeHead(200, {
                "Content-Type": "application/json"
              }).end(JSON.stringify(metadata));
              return;
            }
          }
          res.writeHead(404).end();
        },
        port: httpConfig.port,
        streamEndpoint: httpConfig.endpoint
      });
      console.info(
        `[FastMCP info] server is running on HTTP Stream at http://localhost:${httpConfig.port}${httpConfig.endpoint}`
      );
      console.info(
        `[FastMCP info] Transport type: httpStream (Streamable HTTP, not SSE)`
      );
    } else {
      throw new Error("Invalid transport type");
    }
  }
  /**
   * Stops the server.
   */
  async stop() {
    if (this.#httpStreamServer) {
      await this.#httpStreamServer.close();
    }
  }
  #parseRuntimeConfig(overrides) {
    const args = process.argv.slice(2);
    const getArg = (name) => {
      const index = args.findIndex((arg) => arg === `--${name}`);
      return index !== -1 && index + 1 < args.length ? args[index + 1] : void 0;
    };
    const transportArg = getArg("transport");
    const portArg = getArg("port");
    const endpointArg = getArg("endpoint");
    const envTransport = process.env.FASTMCP_TRANSPORT;
    const envPort = process.env.FASTMCP_PORT;
    const envEndpoint = process.env.FASTMCP_ENDPOINT;
    const transportType = overrides?.transportType || (transportArg === "http-stream" ? "httpStream" : transportArg) || envTransport || "stdio";
    if (transportType === "httpStream") {
      const port = parseInt(
        overrides?.httpStream?.port?.toString() || portArg || envPort || "8080"
      );
      const endpoint = overrides?.httpStream?.endpoint || endpointArg || envEndpoint || "/mcp";
      return {
        httpStream: { endpoint, port },
        transportType: "httpStream"
      };
    }
    return { transportType: "stdio" };
  }
};
export {
  FastMCP,
  FastMCPSession,
  UnexpectedStateError,
  UserError,
  audioContent,
  imageContent
};
//# sourceMappingURL=FastMCP.js.map