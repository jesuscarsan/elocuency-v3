import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';
import https from 'https';
// REDIRECT ALL LOGS TO STDERR TO PREVENT PROTOCOL POLLUTION
console.log = console.error;
// Initialize dotenv at the very top and ensure it's quiet
dotenv.config();
const API_KEY = process.env.OBSIDIAN_API_KEY;
let BASE_URL = process.env.OBSIDIAN_URL;
if (!BASE_URL) {
    const PORT = process.env.OBSIDIAN_PORT || '27123';
    const HOST = process.env.OBSIDIAN_HOST || '127.0.0.1';
    BASE_URL = `https://${HOST}:${PORT}`;
}
// Remove trailing slash if present
if (BASE_URL.endsWith('/')) {
    BASE_URL = BASE_URL.slice(0, -1);
}
if (!API_KEY) {
    console.error('Error: OBSIDIAN_API_KEY environment variable is required.');
    process.exit(1);
}
// Create an axios instance with SSL verification disabled
const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
    },
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
    }),
});
class ObsidianBridgeServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'mcp-obsidian-bridge',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'search_obsidian',
                    description: 'Search for notes in Obsidian using the native search syntax. Supports filter by tag (tag:#todo), path (path:meetings), properties ([status:active]), and content.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'The search query. For properties/frontmatter, use the syntax `["property":value]` (e.g., `["Oficios":Actor]`). For tags: `tag:#todo`.For path: `path:meetings`.',
                            },
                            context: {
                                type: 'boolean',
                                description: 'Include context (surrounding text) in results (default: true)',
                                default: true,
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'get_active_file',
                    description: 'Get the content of the currently active file in Obsidian.',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
                {
                    name: 'execute_command',
                    description: 'Execute an internal Obsidian command by ID.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            commandId: {
                                type: 'string',
                                description: "The command ID to execute (e.g., 'editor:toggle-source'). Use 'app:list-commands' to find IDs.",
                            },
                        },
                        required: ['commandId'],
                    },
                },
                {
                    name: 'list_commands',
                    description: 'List available Obsidian commands.',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                switch (request.params.name) {
                    case 'search_obsidian': {
                        const query = String(request.params.arguments?.query);
                        const context = request.params.arguments?.context !== false; // default true
                        try {
                            // The /search/simple endpoint returns a list of matching files
                            // FIX: The query must be passed as a URL parameter, not in the body.
                            // The plugin expects /search/simple/?query=...
                            const encodedQuery = encodeURIComponent(query);
                            const contextParam = context ? '&contextLength=100' : '&contextLength=0';
                            // We must use POST with an empty body (or simple JSON) but with the query in the URL
                            const response = await client.post(`/search/simple/?query=${encodedQuery}${contextParam}`, {});
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(response.data, null, 2),
                                    },
                                ],
                            };
                        }
                        catch (err) {
                            return {
                                content: [{ type: 'text', text: `Search failed: ${err.message}` }],
                                isError: true,
                            };
                        }
                    }
                    case 'get_active_file': {
                        try {
                            const response = await client.get('/active/');
                            // response.data is the file content if it's a file
                            // headers might contain metadata
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: typeof response.data === 'object'
                                            ? JSON.stringify(response.data)
                                            : String(response.data),
                                    },
                                ],
                            };
                        }
                        catch (err) {
                            if (err.response?.status === 404) {
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'No active file found (Obsidian might be unfocused or no file open).',
                                        },
                                    ],
                                    isError: true,
                                };
                            }
                            return {
                                content: [{ type: 'text', text: `Failed to get active file: ${err.message}` }],
                                isError: true,
                            };
                        }
                    }
                    case 'execute_command': {
                        const commandId = String(request.params.arguments?.commandId);
                        try {
                            await client.post(`/commands/${commandId}`);
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Command '${commandId}' executed successfully.`,
                                    },
                                ],
                            };
                        }
                        catch (err) {
                            return {
                                content: [{ type: 'text', text: `Failed to execute command: ${err.message}` }],
                                isError: true,
                            };
                        }
                    }
                    case 'list_commands': {
                        try {
                            const response = await client.get('/commands/');
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(response.data, null, 2),
                                    },
                                ],
                            };
                        }
                        catch (err) {
                            return {
                                content: [{ type: 'text', text: `Failed to list commands: ${err.message}` }],
                                isError: true,
                            };
                        }
                    }
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof McpError ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Obsidian Bridge MCP server running on stdio');
    }
}
const server = new ObsidianBridgeServer();
server.run().catch(console.error);
