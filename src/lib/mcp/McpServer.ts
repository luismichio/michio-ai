import { McpTool, McpResource } from './types';
import { LocalStorageProvider } from '../storage/local';
import { extractTextFromPdf } from '../pdf';
import { generateSummary } from '../ai/summarizer';
import * as cheerio from 'cheerio';

/**
 * Internal MCP Server Implementation
 * 
 * This acts as the bridge between the AI (Meechi) and the System (Files, External APIs).
 * It strictly follows the Model Context Protocol concept:
 * - Tools: Executable actions
 * - Resources: Readable data
 */
export class McpServer {
    private tools: Map<string, McpTool> = new Map();
    private resources: Map<string, McpResource> = new Map();
    private storage: LocalStorageProvider;

    constructor() {
        this.storage = new LocalStorageProvider();
        this.registerDefaultTools();
    }

    private registerDefaultTools() {
        // Tool: create_file
        this.registerTool({
            name: "create_file",
            description: "Create a new file in the knowledge base. If the folder doesn't exist, it will be created.",
            inputSchema: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path e.g. 'misc/notes/idea.md'" },
                    content: { type: "string", description: "Content of the file" }
                },
                required: ["filePath", "content"]
            },
            handler: async (args) => {
                await this.storage.init();
                
                // Path Normalization
                // 1. Remove leading slashes/backslashes
                let cleanPath = args.filePath.replace(/^[/\\]+/, '');
                // 2. Fix separators
                cleanPath = cleanPath.replace(/\\/g, '/');
                // 3. Trim whitespace around slashes (e.g. "misc / foo")
                cleanPath = cleanPath.split('/').map((p: string) => p.trim()).join('/');
                
                // 3. Prefix with misc/ if needed
                let finalPath = cleanPath;
                if (!finalPath.startsWith('misc/') && !finalPath.startsWith('history/')) {
                    finalPath = `misc/${cleanPath}`;
                }

                // SAFETY: Block source file modification
                if (finalPath.endsWith('.source.md')) {
                    throw new Error("Safety Block: You cannot create or overwrite system source files (.source.md). These are managed by the RAG system and are immutable.");
                }
                
                console.log(`[MCP] Saving file to: ${finalPath}`);
                await this.storage.saveFile(finalPath, args.content);
                console.log(`[MCP] Save complete: ${finalPath}`);
                
                return { success: true, message: `Created ${finalPath}` };
            }
        });

        // Tool: update_file
        this.registerTool({
            name: "update_file",
            description: "Update or overwrite an existing file.",
            inputSchema: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to update" },
                    newContent: { type: "string", description: "New full content" }
                },
                required: ["filePath", "newContent"]
            },
            handler: async (args) => {
                await this.storage.init();

                let cleanPath = args.filePath.replace(/^[/\\]+/, '');
                cleanPath = cleanPath.replace(/\\/g, '/');

                let finalPath = cleanPath;
                if (!finalPath.startsWith('misc/') && !finalPath.startsWith('history/')) {
                    finalPath = `misc/${cleanPath}`;
                }

                // SAFETY: Block source file modification
                if (finalPath.endsWith('.source.md')) {
                    throw new Error("Safety Block: You cannot modify system source files (.source.md). These are immutable.");
                }

                await this.storage.updateFile(finalPath, args.newContent);
                return { success: true, message: `Updated ${finalPath}` };
            }
        });

        // Tool: move_file
        this.registerTool({
            name: "move_file",
            description: "Move or rename a file.",
            inputSchema: {
                type: "object",
                properties: {
                    sourcePath: { type: "string" },
                    destinationPath: { type: "string" }
                },
                required: ["sourcePath", "destinationPath"]
            },
            handler: async (args) => {
                let cleanSource = args.sourcePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
                let cleanDest = args.destinationPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
                
                let source = cleanSource;
                let dest = cleanDest;
                
                if (!source.startsWith('misc/') && !source.startsWith('history/')) source = `misc/${source}`;
                if (!dest.startsWith('misc/') && !dest.startsWith('history/')) dest = `misc/${dest}`;

                // Not fully implemented in LocalStorageProvider yet, simulating read/write/delete
                const content = await this.storage.readFile(source);
                if (!content) throw new Error(`Source file ${source} not found`);
                
                await this.storage.saveFile(dest, content as string);
                await this.storage.deleteFile(source);
                
                return { success: true, message: `Moved ${source} to ${dest}` };
            }
        });

        // Tool: debug_storage
        this.registerTool({
            name: "debug_storage",
            description: "Diagnose storage issues.",
            inputSchema: { type: "object", properties: {} },
            handler: async () => {
                await this.storage.init();
                const probePath = `misc/debug_probe_${Date.now()}.txt`;
                await this.storage.saveFile(probePath, "Probe content");
                
                const allFiles = await this.storage.listFiles('misc');
                const fileList = allFiles.map(f => f.path).join(', ');
                
                return { 
                    success: true, 
                    message: `Storage Check:\n1. Created ${probePath}\n2. Found ${allFiles.length} files in misc.\nFiles: ${fileList}` 
                };
            }
        });



        // Tool: cleanup_orphans
        this.registerTool({
            name: "cleanup_orphans",
            description: "Scan for and delete orphaned .source.md files (where the parent PDF is missing).",
            inputSchema: { type: "object", properties: {} },
            handler: async () => {
                await this.storage.init();
                // Get ALL files to build the map
                const allFiles = await this.storage.listFiles('');
                const fileMap = new Set(allFiles.filter(f => !f.deleted).map(f => f.path));
                
                let deletedCount = 0;
                const deletedFiles: string[] = [];

                for (const file of allFiles) {
                    // Only target .pdf.source.md files
                    if (file.path.endsWith('.pdf.source.md') && !file.deleted) {
                        const originalPdf = file.path.replace('.source.md', '');
                        if (!fileMap.has(originalPdf)) {
                            console.log(`[MCP] Deleting orphan: ${file.path}`);
                            // Using storage directly bypasses the MCP safety block (which is only for update/create tools)
                            try {
                                await this.storage.deleteFile(file.path);
                                deletedFiles.push(file.path);
                                deletedCount++;
                            } catch (e) {
                                console.error(`[MCP] Failed to delete orphan ${file.path}`, e);
                            }
                        }
                    }
                }
                
                return { 
                    success: true, 
                    message: `Cleaned up ${deletedCount} orphans.\nDeleted: ${deletedFiles.join(', ')}` 
                };
            }
        });

        // ------------------------------------------------------------------
        // NEW TOOLS (Jan 2026)
        // ------------------------------------------------------------------

        // Tool: read_pdf
        this.registerTool({
            name: "read_pdf",
            description: "Read text from a PDF file stored in Meechi.",
            inputSchema: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to the PDF file (e.g. misc/paper.pdf)" }
                },
                required: ["filePath"]
            },
            handler: async (args) => {
                await this.storage.init();
                let path = args.filePath.replace(/\\/g, '/');
                if (!path.startsWith('misc/') && !path.startsWith('history/')) path = `misc/${path}`;
                
                // Read binary as ArrayBuffer
                // LocalStorageProvider needs support for ArrayBuffer reading?
                // The current implementation might be string-focused. 
                // Let's assume we can get it or we might need to update storage provider.
                // Wait, LocalStorageProvider wraps IndexedDB (which supports Blobs/Buffers).
                // Let's check if readFile returns specific type or we need cast.
                // The interface says Promise<string | ArrayBuffer | Blob | null>.
                const fileData = await this.storage.readFile(path);
                
                if (!fileData) throw new Error(`File not found: ${path}`);
                
                // Ensure ArrayBuffer
                let buffer: ArrayBuffer;
                if (fileData instanceof ArrayBuffer) {
                    buffer = fileData;
                } else if (fileData instanceof Blob) {
                    buffer = await fileData.arrayBuffer();
                } else if (typeof fileData === 'string') {
                     // Try to convert base64 if it was stored as string? Or throw?
                     // For now, assume PDF logic only works on Buffers.
                     throw new Error("File stored as string, expected binary for PDF.");
                } else {
                     throw new Error("Unknown file format for PDF.");
                }

                console.log(`[MCP] Reading PDF: ${path}`);
                const text = await extractTextFromPdf(buffer);
                
                // Truncate for sanity? 
                // 50k chars is a reasonable "preview" limit for a tool return.
                const truncated = text.length > 50000 ? text.substring(0, 50000) + "\n...(truncated)" : text;

                return {
                    success: true,
                    message: `Read ${path} (${text.length} chars)`,
                    data: truncated
                };
            }
        });

        // Tool: summarize_file
        this.registerTool({
            name: "summarize_file",
            description: "Generate a summary of a text or markdown file.",
            inputSchema: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to file" }
                },
                required: ["filePath"]
            },
            handler: async (args) => {
                await this.storage.init();
                let path = args.filePath.replace(/\\/g, '/');
                if (!path.startsWith('misc/') && !path.startsWith('history/')) path = `misc/${path}`;

                const content = await this.storage.readFile(path);
                if (!content || typeof content !== 'string') {
                    throw new Error(`File not found or not text: ${path}`);
                }

                console.log(`[MCP] Summarizing: ${path}`);
                const summary = await generateSummary(content);
                
                return {
                    success: true,
                    message: `Summary of ${path}`,
                    data: summary
                };
            }
        });

        // Tool: fetch_html
        this.registerTool({
            name: "fetch_html",
            description: "Fetch a URL and return its text content (Markdown-friendly).",
            inputSchema: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The HTTP/HTTPS URL to fetch" }
                },
                required: ["url"]
            },
            handler: async (args) => {
                try {
                    console.log(`[MCP] Fetching: ${args.url}`);
                    const res = await fetch(args.url, {
                        headers: {
                            'User-Agent': 'Meechi/1.0 (Local Friend)'
                        }
                    });
                    
                    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
                    
                    const html = await res.text();
                    
                    // Simple HTML -> Text Cleaning using Cheerio
                    const $ = cheerio.load(html);
                    
                    // Remove junk
                    $('script').remove();
                    $('style').remove();
                    $('nav').remove();
                    $('footer').remove();
                    $('iframe').remove();
                    
                    // Extract text (naive approach for now, usually sufficient for LLM)
                    // Better approach: preserve headers
                    let markdown = "";
                    
                    // Iterate over key block elements
                    $('h1, h2, h3, p, li, pre').each((_, el) => {
                         const tag = el.tagName;
                         const text = $(el).text().trim();
                         if (!text) return;
                         
                         if (tag === 'h1') markdown += `# ${text}\n\n`;
                         else if (tag === 'h2') markdown += `## ${text}\n\n`;
                         else if (tag === 'h3') markdown += `### ${text}\n\n`;
                         else if (tag === 'li') markdown += `- ${text}\n`;
                         else if (tag === 'pre') markdown += `\`\`\`\n${text}\n\`\`\`\n\n`;
                         else markdown += `${text}\n\n`;
                    });

                    // Truncate
                    const truncated = markdown.length > 20000 ? markdown.substring(0, 20000) + "\n...(truncated)" : markdown;
                    
                    return {
                        success: true,
                        message: `Fetched ${args.url}`,
                        data: truncated
                    };

                } catch (e: any) {
                     return { error: `Fetch Failed: ${e.message}` };
                }
            }
        });

        // Tool: query_rag
        this.registerTool({
            name: "query_rag",
            description: "Search the internal knowledge base (Sources & Notes) for information.",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query (e.g. 'What is the refund policy?')" }
                },
                required: ["query"]
            },
            handler: async (args) => {
                await this.storage.init();
                console.log(`[MCP] Doing Manual RAG Search: ${args.query}`);
                
                // Reuse the existing robust RAG logic from LocalStorageProvider
                const context = await this.storage.getKnowledgeContext(args.query);
                
                return {
                    success: true,
                    message: "Search Complete",
                    data: context
                };
            }
        });
    }

    registerTool(tool: McpTool) {
        this.tools.set(tool.name, tool);
    }

    getTools() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema // Compatible with OpenAI function calling
        }));
    }

    async executeTool(name: string, args: any): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool ${name} not found`);
        }
        try {
            console.log(`[MCP] Executing ${name} with`, args);
            return await tool.handler(args);
        } catch (error: any) {
            console.error(`[MCP] Tool ${name} failed:`, error);
            return { error: error.message };
        }
    }
}

export const mcpServer = new McpServer();
