import { AITool } from "./types";

export const TOOLS: AITool[] = [
    {
        type: "function",
        "function": {
            name: "update_file",
            description: "Update the content of an existing file in the user's Knowledge Base (misc/ folder). Use this when the user explicitly asks to edit, modify, or append to a note.",
            parameters: {
                type: "object",
                properties: {
                    filePath: {
                        type: "string",
                        description: "The path of the file to update (e.g., 'misc/notes/todo.md').",
                    },
                    newContent: {
                        type: "string",
                        description: "The FULL new content of the file. This REPLACES the old content.",
                    },
                },
                required: ["filePath", "newContent"],
            },
        },
    },
    {
        type: "function",
        "function": {
            name: "create_file",
            description: "Create a new file. If the folder path doesn't exist, it will be created automatically. Use this for creating new notes, lists, or other documents.",
            parameters: {
                type: "object",
                properties: {
                    filePath: {
                        type: "string",
                        description: "The path for the new file (e.g., 'misc/shopping/list.md').",
                    },
                    content: {
                        type: "string",
                        description: "The content of the new file.",
                    },
                },
                required: ["filePath", "content"],
            },
        },
    },
    {
        type: "function",
        "function": {
            name: "update_user_settings",
            description: "Update the user's profile settings such as their Name or preferred AI Tone. Use this during onboarding or when the user explicitly asks to change these settings.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "The user's preferred name (e.g. 'Luis', 'Captain')."
                    },
                    tone: {
                        type: "string",
                        description: "The preferred tone for the AI (e.g. 'Professional', 'Sarcastic', 'Pirate')."
                    }
                },
            },
        },
    },
    {
        type: "function",
        "function": {
            name: "move_file",
            description: "Move or rename a file. Use this to organize files into folders (Topics) or rename them.",
            parameters: {
                type: "object",
                properties: {
                    sourcePath: {
                        type: "string",
                        description: "The current path of the file (e.g. 'temp/myfile.pdf')."
                    },
                    destinationPath: {
                        type: "string",
                        description: "The new path for the file (e.g. 'misc/Work/myfile.pdf')."
                    }
                },
                required: ["sourcePath", "destinationPath"]
            }
        }
    },
    {
        type: "function",
        "function": {
            name: "fetch_url",
            description: "Fetch content from a URL to save as a source. Use this when the user shares a link.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "The URL to fetch."
                    },
                    destinationPath: {
                        type: "string",
                        description: "The path to save the source to (e.g. 'misc/Research/source.md')."
                    }
                },
                required: ["url", "destinationPath"]
            }
        }
    }
];
