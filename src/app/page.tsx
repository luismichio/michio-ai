'use client';
import { useSession, signIn, signOut } from "next-auth/react";
import { localLlmService } from "@/lib/ai/local-llm";
import { AIChatMessage } from "@/lib/ai/types";
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from "react";
import GuestJournal from './components/GuestJournal';
import styles from './page.module.css';
import CalendarView from './components/CalendarView';

// ... imports
import { LocalStorageProvider } from '@/lib/storage/local';
import { settingsManager } from '@/lib/settings';
import { useSync } from '@/hooks/useSync';
import { useMeechi } from '@/hooks/useMeechi';
import AddSourceModal from './components/AddSourceModal';
import FileExplorer from './components/FileExplorer';
import SourceViewer from './components/SourceViewer';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export default function Home() {
  const { data: session, update } = useSession();
  const [chatInput, setChatInput] = useState("");
  // Messages now hold more metadata
  const [messages, setMessages] = useState<{
      role: 'user' | 'michio', 
      content: string, 
      timestamp?: string, 
      usage?: { total_tokens: number }
  }[]>([]);
  
  const [isChatting, setIsChatting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  // Fix Hydration Error: Initialize empty, set on mount
  const [currentDate, setCurrentDate] = useState<string>(""); 
  
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [returnToExplorer, setReturnToExplorer] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<{title: string, content: string} | null>(null);
  
  // Message Modal State
  const [messageModal, setMessageModal] = useState<{title: string, message: string} | null>(null);
  const showMessage = (title: string, message: string) => setMessageModal({ title, message });
  const streamRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // New State for Rolling Window
  const [historyLimit, setHistoryLimit] = useState(20); // Initial load limit
  const [sessionUsage, setSessionUsage] = useState({ input: 0, output: 0, total: 0 });
  
  // Attached Files State
  const [attachedFiles, setAttachedFiles] = useState<{name: string, path: string}[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Storage Provider
  const [storage] = useState(() => new LocalStorageProvider());
  
  // Local AI Progress State (Managed by useMeechi)
  const meechi = useMeechi();
  
  // Rate Limit Cooldown State (Timestamp when we can try server again)
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number | null>(null);

  // Load Persisted Rate Limit on Mount
  useEffect(() => {
      const persisted = localStorage.getItem('michio_rate_limit_cooldown');
      if (persisted) {
          const timestamp = parseInt(persisted);
          if (timestamp > Date.now()) {
            setRateLimitCooldown(timestamp);
            console.log(`[Smart Rate Limit] Loaded persisted cooldown until ${new Date(timestamp).toLocaleTimeString()}`);
          } else {
             localStorage.removeItem('michio_rate_limit_cooldown');
          }
      }
  }, []);

  // Pre-load Local AI on Mount
  // Pre-load Local AI logic moved to useMeechi hook

  // Helper: Parse Rate Limit Duration
  function parseRateLimitDuration(errorMsg: string): number {
    // "Please try again in 48m48.096s"
    const match = errorMsg.match(/Please try again in\s+([\d\.ms]+)/);
    if (!match) return 0;
    
    const durationStr = match[1];
    let ms = 0;
    
    // Parse "48m48.096s"
    const parts = durationStr.match(/(\d+)m/);
    if (parts) ms += parseInt(parts[1]) * 60 * 1000;
    
    const secParts = durationStr.match(/([\d\.]+)s/);
    if (secParts) ms += parseFloat(secParts[1]) * 1000;
    
    return ms;
  }

  // Set Date on Mount (Client-side only)
  useEffect(() => {
      const date = new Date();
      const str = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      setCurrentDate(str);
      
      // TRIGGER MIGRATION (Ensures DB is ready before usage)
      storage.init().catch(err => console.error("Storage Init Failed", err));
  }, [storage]);

  // Sync Engine (Background & Manual)
  const { isSyncing, syncNow, syncError, syncMessage, syncLogs } = useSync(storage, session, update, currentDate);

  const handleSaveSource = async (topic: string, fileName: string, content: string) => {
      // 1. Generate Auto-Summary
      let finalContent = content;
      try {
          const res = await fetch('/api/ai/summarize', {
              method: 'POST',
              body: JSON.stringify({ content }),
              headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.summary) {
              finalContent = `> **Summary**: ${data.summary}\n\n---\n\n${content}`;
          }
      } catch (e) {
          console.error("Auto-summary failed", e);
      }

      // 2. Save to: misc/topic/filename
      await storage.saveFile(`misc/${topic}/${fileName}`, finalContent);
      
      // Notify Chat (System Message?) or just trigger Sync
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = `### ${timestamp}\n**Meechi**: I have added *${fileName}* to the *${topic}* collection.\n`;
      await storage.appendFile(`history/${currentDate}.md`, logEntry);
      
      setMessages(prev => [...prev, { role: 'michio', content: `I have added *${fileName}* to the *${topic}* collection.` }]);
      
      // Trigger Source Sync
      syncNow();
  };

  // Reset scroll tracker when date changes
  useEffect(() => {
      hasScrolledRef.current = false;
  }, [currentDate]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [chatInput]);

  // Load history (Run once on mount/date change - then Sync keeps it updated)
  useEffect(() => {
    async function load() {
        if (currentDate) {
            setIsLoadingHistory(true);
            try {
                // Always init storage first
                await storage.init();
                const content = await storage.readFile(`history/${currentDate}.md`) || "";

                if (content && typeof content === 'string' && !content.startsWith("No journal")) {
                    // SANITIZATION: Clean up any corrupted tool calls AND text hallucinations from storage
                    // 1. Remove <function...> tags
                    let cleanContent = content.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '');
                    
                    // 2. Remove "Settings updated..." repetitions (The specific phrase interfering with chat)
                    // We look for lines starting with **Meechi**: Settings updated
                    // regex: matches "**Meechi**: Settings updated" context
                    cleanContent = cleanContent.replace(/^\*\*Meechi\*\*: Settings updated.*?(\n|$)/gmi, ""); 
                    cleanContent = cleanContent.replace(/^\*\*Meechi\*\*: I will call you.*?(\n|$)/gmi, "");
                    cleanContent = cleanContent.replace(/Settings updated\. I will call you.*?(\n|$)/gmi, "");

                    // If we made changes, save it back cleaned
                    if (cleanContent.length !== content.length) {
                        console.log("[History] Sanitized corrupted history file (Functions + Hallucinations).");
                        await storage.saveFile(`history/${currentDate}.md`, cleanContent);
                    }

                    const parsed = parseLogToMessages(cleanContent);
                    // Slice for "Load More" functionality (show last N)
                    const visibleMessages = parsed.slice(-historyLimit);
                    setMessages(visibleMessages);
                    
                    if (visibleMessages.length > 0 && !hasScrolledRef.current) {
                        scrollToBottom();
                        hasScrolledRef.current = true;
                    }
                } else {
                    setMessages([]);
                    // Onboarding Check (Only if no history today and we are seemingly new)
                    const config = await settingsManager.getConfig();
                    if (config.identity.name === 'Traveler') {
                         setMessages([{
                             role: 'michio',
                             content: "Hello! I am Michio, your personal cognitive partner. We haven't been properly introduced yet. What should I call you?",
                             timestamp: new Date().toLocaleTimeString()
                         }]);
                    }
                }
            } catch (err) {
                console.error("Failed to load history", err);
            } finally {
                setIsLoadingHistory(false);
            }
        }

    }
    load();
  }, [currentDate, storage, historyLimit]); // Added historyLimit dependency

  // Helper: Summary with Fallback
  async function summarizeWithFallback(content: string): Promise<string | null> {
      try {
          // 1. Try Server API
          const res = await fetch('/api/ai/summarize', {
              method: 'POST',
              body: JSON.stringify({ content }),
              headers: { 'Content-Type': 'application/json' }
          });
          if (res.ok) {
              const data = await res.json();
              if (data.summary) return data.summary;
          }
      } catch (err) {
          console.warn("[Summary] Server failed, trying Local AI...", err);
      }

      // 2. Try Local AI
      try {
          const config = await settingsManager.getConfig();
          if (config.localAI?.enabled && localLlmService.isLoading() === false) {
              console.log("[Summary] Using Local AI...");
              // We need a non-streaming chat call here.
              // We can reusing the existing chat method but ignoring the update callback for the most part
              // or just accumulating it.
              
              const prompt = `Summarize the following content in 1-2 sentences. Start with "The content discusses...":\n\n${content.substring(0, 2000)}`; // Truncate for speed
              
              let summary = "";
              await localLlmService.chat([
                  { role: 'user', content: prompt }
              ], (chunk) => { summary += chunk; });
              
              return summary.trim();
          }
      } catch (localErr) {
          console.error("[Summary] Local AI also failed", localErr);
      }

      return null;
  }

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput("");
    setIsChatting(true);
    scrollToBottom();
    
    try {
        const timestamp = new Date().toLocaleTimeString();
        
        // 1. Save User Message Locally
        let logEntry = `### ${timestamp}\n**User**: ${userMsg}\n`;
        
        // Append attachment info to log
        if (attachedFiles.length > 0) {
            const attInfo = attachedFiles.map(f => `[Attached: ${f.path}]`).join(', ');
            logEntry = `### ${timestamp}\n**User**: ${userMsg}\n${attInfo}\n`;
        }
        
        await storage.appendFile(`history/${currentDate}.md`, logEntry);
        
        // Update local state immediately with estimate
        const estimatedTokens = Math.ceil(userMsg.length / 4);
        setMessages(prev => {
            const newArr = [...prev];
            // Update the last user message with timestamp/estimate
            const lastIdx = newArr.length - 1;
            if (newArr[lastIdx]) {
                newArr[lastIdx] = { 
                    ...newArr[lastIdx], 
                    timestamp, 
                    usage: { total_tokens: estimatedTokens } 
                };
            }
            return newArr;
        });

        // 2. Read Context (Rolling Window 6h + Knowledge Base)
        const localHistory = await storage.getRecentLogs(6); 
        const knowledgeContext = await storage.getKnowledgeContext(userMsg);
        
        console.log(`[Page] RAG Retrieval for "${userMsg}":`, knowledgeContext ? `${knowledgeContext.length} chars found` : "EMPTY");
        if (knowledgeContext) console.log("[Page] RAG Snippet:", knowledgeContext.substring(0, 200));

        let fullContext = `${knowledgeContext}\n\n--- Current Conversation History (Last 6h) ---\n${localHistory}`;
        
        // Inject Attachment Context
        if (attachedFiles.length > 0) {
            fullContext += `\n\n[SYSTEM: User has attached files. Look at 'temp/' folder if needed. Tools available: move_file, fetch_url.]`;
            // Clear attachments after sending
            setAttachedFiles([]);
        }

        // 3. Call AI (Stateless - just compute)
        
        // DOUBLE SHORT-CIRCUIT: Explicitly handle greetings here to save time/resources
        // and prevent any chance of tool hallucination for simple hellos.
        const cleanInput = userMsg.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const inputWords = cleanInput.split(/\s+/);
        console.log(`[Page] Short-circuit check. Msg: "${userMsg}", Clean: "${cleanInput}", Words:`, inputWords);
        
        // Check for greetings OR simple identity questions (to avoid LLM overhead for trivialities)
        if (inputWords.length <= 4 && (
        ['hi', 'hello', 'hey', 'greetings', 'yo', 'hola', 'bonjour'].includes(inputWords[0]) ||
        (inputWords[0] === 'who' && inputWords.includes('you')) ||
        (inputWords[0] === 'what' && inputWords.includes('name'))
        )) {
            console.log("[Page] Triggering Short-Circuit Greeting");
            const quickReply = "Hello! I am Meechi, your local AI assistant.";
            setMessages(prev => [...prev, { role: 'michio', content: quickReply, timestamp: new Date().toLocaleTimeString() }]);
            // Save to history immediately
            await storage.appendFile(`history/${currentDate}.md`, `**Meechi**: ${quickReply}\n`);
            setIsChatting(false);
            scrollToBottom();
            return;
        }

        const config = await settingsManager.getConfig();
        const respTimestamp = new Date().toLocaleTimeString(); // Hoist timestamp for use in fallback
        
        // LOCAL-FIRST LOGIC: 
        // 1. If Local AI is enabled -> Try Local. 
        // 2. Fallback to Cloud only if Local fails significantly (managed separately) or if Local Disabled.
        const useLocalFirst = config.localAI && config.localAI.enabled;
        let isFallback = false;
        
        // Smart Rate Limit Check (Only relevant if we use Cloud)
        if (!useLocalFirst && rateLimitCooldown && Date.now() < rateLimitCooldown) {
            console.warn(`[Smart Rate Limit] Skipping Server API. Cooldown active until ${new Date(rateLimitCooldown).toLocaleTimeString()}`);
            isFallback = true;
        }

        let data: any;
        let toolCalls: any[] | undefined;
        let usageData: any;
        
        // --- 1. LOCAL EXECUTION PATH ---
        if (useLocalFirst) {
             console.log("[Chat] Using Local AI (Priority)...");
             try {
                 const truncatedContext = fullContext.length > 3000 ? fullContext.substring(0, 3000) + "...(truncated)" : fullContext;
                 
                 const historyForAI: AIChatMessage[] = messages.map(m => ({ 
                    role: m.role === 'michio' ? 'assistant' : 'user', 
                    content: m.content 
                 }));

                 console.log("[Page] Sending to Local AI...");
                 let currentContent = "";
                 
                 await meechi.chat(userMsg, historyForAI, truncatedContext, (chunk) => {
                    currentContent += chunk;
                    
                    // IN-STREAM BLOCKING: Check for banned tool immediately
                    if (currentContent.includes('update_user_settings')) {
                        console.warn("[Local AI] In-stream BLOCK of update_user_settings");
                        const cleanContent = currentContent.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, "").trim();
                        currentContent = cleanContent || "I heard you!";
                    }

                    setMessages(prev => {
                        const msgs = [...prev];
                        const last = msgs[msgs.length - 1];
                        if (last.role === 'michio' && last.timestamp === respTimestamp) {
                            last.content = currentContent;
                            return msgs;
                        } else {
                            return [...msgs, { role: 'michio', content: currentContent, timestamp: respTimestamp }];
                        }
                    });
                 });
                 
                 // --- POST-STREAM EXECUTION ---
                 // If we found toolCalls during the stream, we simply let the existing logic below handle it?
                 // NO, the existing logic is inside the `try { if(!isFallback)... }` block which we are OUTSIDE of.
                 // We need to validly execute the tool here if `toolCalls` is populated.
                 
                 if (toolCalls && toolCalls.length > 0) {
                     const call = toolCalls[0];
                     console.log("[Local AI] Executing Tool:", call.function.name);
                     
                     // Execute Tool logic (Simulated here since we duplicate the Cloud logic)
                     // Ideally we refactor 'handleToolExecution' to be shared.
                     // For now, specifically handle 'fetch_url' which is what Sage 1B calls.
                     if (call.function.name === 'fetch_url') {
                         const args = JSON.parse(call.function.arguments);
                         setMessages(prev => [...prev, { role: 'michio', content: `Checking ${args.url}...`, timestamp: respTimestamp }]);
                         
                         try {
                             const fetchRes = await fetch('/api/proxy?url=' + encodeURIComponent(args.url));
                             const text = await fetchRes.text();
                             const snippet = text.slice(0, 1000); // Feed back first 1000 chars
                             
                             // Recursive call with new context? 
                             // Or just append result. Simpler to just append result for now.
                             setMessages(prev => [...prev, { role: 'michio', content: `**Summary from ${args.url}**:\n${snippet}...\n\n(Note: Full RAG loop not yet active for Local AI tools)`, timestamp: respTimestamp }]);
                         } catch (e) {
                             setMessages(prev => [...prev, { role: 'michio', content: "Failed to read that URL.", timestamp: respTimestamp }]);
                         }
                         setIsChatting(false);
                         return;
                     }
                 }



                 // Success!
                 // SAVE TO HISTORY: (Crucial Step restored)
                 const finalLogEntry = `### ${respTimestamp}\n**User**: ${userMsg}\n**Meechi**: ${currentContent}\n\n`;
                 await storage.appendFile(`history/${currentDate}.md`, finalLogEntry);

                 setIsChatting(false);
                 return; 

             } catch (localError: any) {
                 console.error("Local AI failed. Attempting Cloud Fallback...", localError);
                 // Proceed to Cloud block below
             }
        }

        // --- 2. CLOUD EXECUTION PATH ---
        try {
            if (isFallback) {
                throw new Error("[Smart Rate Limit] Skipping Server API");
            }

            if (!isFallback) {
             const res = await fetch("/api/chat", {
                method: "POST",
                body: JSON.stringify({ 
                    message: userMsg,
                    history: messages.slice(-10).map(m => ({ role: m.role === 'michio' ? 'assistant' : 'user', content: m.content })), 
                    context: fullContext,
                    config
                }), 
                headers: { "Content-Type": "application/json" },
            });
            
            if (!res.ok) {
                // If it's a rate limit or server error, throw to catch block
                if (res.status === 429 || res.status >= 500) {
                     const errText = await res.text();
                     throw new Error(`Server Error: ${res.status} - ${errText}`);
                }
                const data = await res.json();
                throw new Error(data.message || "Unknown error");
            }
            
            data = await res.json();
            toolCalls = data.tool_calls;
            usageData = data.usage;
            } // End if(!isFallback)

        } catch (serverError: any) {
            console.error("Server API failed:", serverError);
            isFallback = true;
            
            // Extract Rate Limit Duration if valid
            const errorMsg = serverError.message || "";
            if (errorMsg.includes("429") || errorMsg.includes("rate_limit_exceeded")) {
                const duration = parseRateLimitDuration(errorMsg);
                if (duration > 0) {
                    const cooldownUntil = Date.now() + duration;
                    setRateLimitCooldown(cooldownUntil);
                    localStorage.setItem('michio_rate_limit_cooldown', cooldownUntil.toString());
                    console.log(`[Smart Rate Limit] Penalty detected. Cooldown set for ${duration}ms (until ${new Date(cooldownUntil).toLocaleTimeString()})`);
                }
            }

            // Check Local AI Fallback
            if (config.localAI && config.localAI.enabled) {
                 // Use Meechi Hook for Chat
                 try {
                     const toolPrompt = `
IMPORTANT INSTRUCTIONS:
1. You are Meechi, a helpful AI assistant.
2. You have access to these tools:
   - move_file(sourcePath, destinationPath)
   - create_file(filePath, content)
   - update_file(filePath, newContent, oldContent)
   - fetch_url(url)
   
3. To use a tool, output ONLY a valid JSON block and nothing else.
4. PRIORITIZE LOCAL CONTEXT: The text below labeled "RETRIEVED LOCAL FILES" contains the actual content of the user's files. USE IT.
   - If the user asks "Did you look at my files?", say YES and cite the file names found in the context.
   - DO NOT say "I cannot see files". You CAN see the text of the files below.
   - Only use 'fetch_url' if the answer is NOT in the local context and the user explicitly asks.
5. NO REPETITION: Do NOT repeat previous tool actions.
6. GREETINGS: If user says "hello", "hi", etc., just reply "Hello! How can I help?" DO NOT use any tools.
`;
                     // Explicitly label the context so the model knows it's from files
                     const contextPayload = `\n\n=== RETRIEVED LOCAL FILES & HISTORY ===\n${fullContext}\n=======================================\n`;
                     
                     // Truncate safely
                     const truncatedContext = contextPayload.length > 3500 ? contextPayload.substring(0, 3500) + "...(truncated)" : contextPayload;
                     let currentContent = "";

                     const historyForAI: AIChatMessage[] = messages.map(m => ({ 
                        role: m.role === 'michio' ? 'assistant' : 'user', 
                        content: m.content 
                     }));

                     // (Short-circuit moved to top of handleChat)
                     
                     console.log("[Page] Sending to AI...");
                     await meechi.chat(userMsg, historyForAI, truncatedContext, (chunk) => {
                        currentContent += chunk;
                        
                        // IN-STREAM BLOCKING: Check for banned tool immediately
                        if (currentContent.includes('update_user_settings')) {
                            console.warn("[Local AI] In-stream BLOCK of update_user_settings");
                            const cleanContent = currentContent.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, "").trim();
                            currentContent = cleanContent || "I heard you!";
                        }
                        
                        // TOOL DETECTION (Local 1B/8B Format: <function name="...">{args}</function>)
                        const toolMatch = currentContent.match(/<function=\s*"([^"]+)"\s*>(.*?)<\/function>/s) || 
                                          currentContent.match(/<function=(.*?)>(.*?)<\/function>/s) ||
                                          // 1B often does: <function=fetch_url>{"url": "..."}</function>
                                          currentContent.match(/<function[\s$]+(\w+)[\s$]*>(.*?)<\/function>/s); // Generic fallback

                        if (toolMatch) {
                            const [fullMatch, tName, tArgs] = toolMatch;
                            // Clean up name
                            const rawName = tName.replace(/["'$]/g, "").trim(); 
                            
                            // If we have a complete tag, valid JSON, we can parse it
                            if (fullMatch && tArgs.trim().endsWith("}")) {
                                try {
                                    const args = JSON.parse(tArgs.trim());
                                    console.log(`[Local AI] Detected Tool: ${rawName}`, args);
                                    
                                    // Hoist into toolCalls array for the execution block below
                                    if (!toolCalls) toolCalls = [];
                                    toolCalls.push({
                                        function: {
                                            name: rawName,
                                            arguments: JSON.stringify(args)
                                        }
                                    });
                                    
                                    // Hide from UI
                                    currentContent = "🔄 Analyzing external source..."; 
                                } catch (e) {
                                    // JSON not ready yet, keep waiting
                                }
                            }
                        }

                        setMessages(prev => {
                            const msgs = [...prev];
                            const last = msgs[msgs.length - 1];
                            if (last.role === 'michio' && last.timestamp === respTimestamp) {
                                last.content = currentContent;
                                return msgs;
                            } else {
                                return [...msgs, { role: 'michio', content: currentContent, timestamp: respTimestamp }];
                            }
                        });
                     });

                    // Helper to extract JSON or Tool Tag
                    const extractToolCall = (text: string): { raw: string, data: any } | null => {
                        // 1. Try Standard JSON Block
                        const start = text.indexOf('{');
                        if (start !== -1) {
                            let count = 0;
                            for (let i = start; i < text.length; i++) {
                                if (text[i] === '{') count++;
                                if (text[i] === '}') count--;
                                if (count === 0) {
                                    try {
                                        const raw = text.substring(start, i + 1);
                                        return { raw, data: JSON.parse(raw) };
                                    } catch (e) { return null; }
                                }
                            }
                        }

                        // 2. Try <functionXname{args}> format
                        // Simple, permissive regex that grabs everything between <function... and ...>
                        const funcMatch = text.match(/<function(.*?)>([\s\S]*?)(?:<\/function>|$)/i) || 
                                          text.match(/<function\W?([\w_]+)(?:.*?)>([\s\S]*?)(?:<\/function>|$)/i); // older fallback
                                          
                        if (funcMatch) {
                            try {
                                const toolName = funcMatch[1];
                                let potentialJson = funcMatch[2].trim();
                                let args = {};
                                
                                // aggressive JSON finding: ignore any garbage before the first '{'
                                const jsonStart = potentialJson.indexOf('{');
                                if (jsonStart !== -1) {
                                    potentialJson = potentialJson.substring(jsonStart);
                                    // Also check for trailing garbage after the closing '}'
                                    const jsonEnd = potentialJson.lastIndexOf('}');
                                    if (jsonEnd !== -1) {
                                        potentialJson = potentialJson.substring(0, jsonEnd + 1);
                                    }
                                    args = JSON.parse(potentialJson);
                                }
                                
                                console.log("[Local AI] Parsing fallback tool:", toolName);
                                return { raw: funcMatch[0], data: { tool: toolName, args } };
                            } catch (e) {
                                console.warn("Failed to parse fallback tool args", e);
                                // Even if parsing fails, return raw so we can strip it
                                return { raw: funcMatch[0], data: { tool: funcMatch[1], args: {} } };
                            }
                        }
                        
                        return null;
                    };

                    const toolMatch = extractToolCall(currentContent);

                    if (toolMatch) {
                        try {
                            const { raw, data } = toolMatch;
                            let toolName = data.tool;
                            let toolArgs = data.args;

                            // Handle Flat JSON (where args are at top level)
                            if (toolName && !toolArgs) {
                                const { tool, ...rest } = data;
                                toolArgs = rest;
                            }

                            // FORCE BLOCK: Explicitly prevent update_user_settings
                            if (toolName === 'update_user_settings') {
                                console.warn("[Local AI] BLOCKED hallucinated tool: update_user_settings");
                                // Strip it from the content so usage doesn't see it
                                const stripped = currentContent.replace(raw, "").trim();
                                currentContent = stripped || "I heard you!"; // Fallback text if empty
                                
                                // Update UI to show the stripped intent
                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    if (last.role === 'michio' && last.timestamp === respTimestamp) {
                                        last.content = currentContent;
                                        return msgs;
                                    }
                                    return prev;
                                });
                                // Do NOT not add to toolCalls, effectively ignoring it
                            }
                            else if (toolName && toolArgs) {
                                console.log("[Local AI] Detected Tool Call:", data);
                                toolCalls = [{
                                    function: {
                                        name: toolName,
                                        arguments: JSON.stringify(toolArgs)
                                    }
                                }];
                                // Hide Tool Call from UI using the ACTUAL raw string found
                                const strippedContent = currentContent.replace(raw, "").trim();
                                currentContent = strippedContent.replace(/```json/g, "").replace(/```/g, "").trim();
                                
                                if (!currentContent) currentContent = "🔄 Executing local tool...";

                                // Update UI with stripped content
                                setMessages(prev => {
                                    const msgs = [...prev];
                                    const last = msgs[msgs.length - 1];
                                    if (last.role === 'michio' && last.timestamp === respTimestamp) {
                                        last.content = currentContent;
                                        return msgs;
                                    }
                                    return prev;
                                });
                            }
                        } catch (e) {
                             // 'raw' variable isn't available here directly if it came from toolMatch destructuring above
                             // But we can just log a generic error or safely skip
                            console.error("[Local AI] Failed to parse tool execution JSON.", e);
                        }
                    }

                    data = { response: currentContent };

                 } catch (localError: any) {
                     console.error("Local AI failed:", localError);
                     setMessages(prev => [...prev, { role: 'michio', content: `**System**: Server rate limit reached and Local AI failed: ${localError.message}`, timestamp: respTimestamp }]);
                     setIsChatting(false);
                     return;
                 }
            } else {
                 setMessages(prev => [...prev, { role: 'michio', content: `**System**: Server rate limit reached. Enable Local AI in settings for free offline access.`, timestamp: respTimestamp }]);
                 setIsChatting(false);
                 return;
            }
        }
        
        const responseText = data.response;
        // usageData might be undefined from local execution

        // Update Session Stats
        if (usageData) {
            setSessionUsage(prev => ({
                input: prev.input + (usageData.prompt_tokens || 0),
                output: prev.output + (usageData.completion_tokens || 0),
                total: prev.total + (usageData.total_tokens || 0)
            }));
        }



        // Handle Tool Calls (e.g. update_file)
        if (toolCalls && toolCalls.length > 0) {
             for (const tool of toolCalls) {
                 if (tool.function.name === 'update_file') {
                     try {
                         const args = JSON.parse(tool.function.arguments);
                         let newContent = args.newContent;

                         // Auto-Summarize for AI Edits too
                         if (args.newContent && args.newContent.length > 50) {
                            const summary = await summarizeWithFallback(args.newContent);
                            if (summary) {
                                newContent = `> **Summary**: ${summary}\n\n---\n\n${newContent}`;
                            }
                         }

                         await storage.updateFile(args.filePath, newContent);
                         
                         // Create success message
                         const confirmMsg = `I've updated *${args.filePath}* with the new content (and summary).`;
                         
                         setMessages(prev => [...prev, { 
                            role: 'michio', 
                            content: confirmMsg, 
                            timestamp: respTimestamp,
                            usage: usageData ? { total_tokens: usageData.completion_tokens } : undefined
                        }]);

                        // Save Log
                        await storage.appendFile(`history/${currentDate}.md`, `**Meechi**: ${confirmMsg}\n`);
                     } catch (e: any) {
                         console.error("Tool Exec Error", e);
                         setMessages(prev => [...prev, { role: 'michio', content: `Failed to update file: ${e.message}`, timestamp: respTimestamp }]);
                     }
                 }

             if (tool.function.name === 'create_file') {
                 try {
                     const args = JSON.parse(tool.function.arguments);


                     let content = args.content;
                     // Auto-Summarize
                     if (content && content.length > 50) {
                        const summary = await summarizeWithFallback(content);
                        if (summary) {
                            content = `> **Summary**: ${summary}\n\n---\n\n${content}`;
                        }
                     }

                     await storage.saveFile(args.filePath, content);
                     
                     const confirmMsg = `I've created *${args.filePath}* with the generated content (and summary).`;
                     
                     setMessages(prev => [...prev, { 
                        role: 'michio', 
                        content: confirmMsg, 
                        timestamp: respTimestamp,
                        usage: usageData ? { total_tokens: usageData.completion_tokens } : undefined
                    }]);

                    await storage.appendFile(`history/${currentDate}.md`, `**Meechi**: ${confirmMsg}\n`);
                 } catch (e: any) {
                     console.error("Tool Exec Error", e);
                     setMessages(prev => [...prev, { role: 'michio', content: `Failed to create file: ${e.message}`, timestamp: respTimestamp }]);
                 }
             }

             if (tool.function.name === 'update_user_settings') {
                try {
                    const args = JSON.parse(tool.function.arguments);
                    const { name, tone } = args;
                    const currentConfig = await settingsManager.getConfig();
                    const newIdentity = { ...currentConfig.identity };
                    
                    if (name) newIdentity.name = name;
                    if (tone) newIdentity.tone = tone;
    
                    await settingsManager.saveConfig({
                        ...currentConfig,
                        identity: newIdentity
                    });
                    
                    const updateMsg = `Settings updated. I will call you **${newIdentity.name}** and speak in a **${newIdentity.tone}** tone.`;
                    
                    setMessages(prev => [...prev, { 
                        role: 'michio', 
                        content: updateMsg, 
                        timestamp: respTimestamp,
                        usage: usageData ? { total_tokens: usageData.completion_tokens } : undefined
                    }]);
                    await storage.appendFile(`history/${currentDate}.md`, `**Meechi**: ${updateMsg}\n`);

                } catch (e: any) {
                     console.error("Tool Settings Error", e);
                }
             }
     
             
             if (tool.function.name === 'move_file') {
                 try {
                     const args = JSON.parse(tool.function.arguments);
                     console.log(`[Tool] move_file called: ${args.sourcePath} -> ${args.destinationPath}`);
                     
                     // 1. Verify existence before move
                     let finalSourcePath = args.sourcePath;
                     const exists = await storage.getFile(args.sourcePath);
                     
                     if (!exists) {
                         console.warn(`[Tool] Source file not found: ${args.sourcePath}. Checking temp/ prefix...`);
                         // Fix: Check if it's in temp/ but user/AI didn't specify
                         const tempPath = `temp/${args.sourcePath}`;
                         const tempExists = await storage.getFile(tempPath);
                         
                         if (tempExists) {
                             console.log(`[Tool] Found file in temp: ${tempPath}`);
                             finalSourcePath = tempPath;
                         } else {
                             // Deep search / listing? For now just fail if not in direct temp
                              throw new Error(`File not found: ${args.sourcePath}`);
                         }
                     }
                     
                     // 2. Auto-Summarize if text/md
                     const isText = finalSourcePath.endsWith('.md') || finalSourcePath.endsWith('.txt');
                     // Avoid re-summarizing if it's already a source file or has summary
                     const isAlreadySource = finalSourcePath.includes('.source.'); 
                     
                     if (isText && !isAlreadySource) {
                        try {
                             const content = await storage.readFile(finalSourcePath);
                             if (typeof content === 'string' && content.length > 50 && !content.startsWith('> **Summary**')) {
                                 setMessages(prev => [...prev, { role: 'michio', content: `Summarizing content before filing...`, timestamp: respTimestamp }]);
                                 
                                 const summary = await summarizeWithFallback(content);
                                 if (summary) {
                                     const newContent = `> **Summary**: ${summary}\n\n---\n\n${content}`;
                                     await storage.saveFile(finalSourcePath, newContent);
                                 }
                             }
                        } catch (e) {
                             console.error("[Move] Summary failed, proceeding with move.", e);
                        }
                     }

                     await storage.renameFile(finalSourcePath, args.destinationPath);
                     
                     const msg = `Moved *${finalSourcePath}* to *${args.destinationPath}*.`;
                     setMessages(prev => [...prev, { role: 'michio', content: msg, timestamp: respTimestamp }]);
                     await storage.appendFile(`history/${currentDate}.md`, `**Meechi**: ${msg}\n`);
                 } catch (e: any) {
                     console.error("Move Error", e);
                     setMessages(prev => [...prev, { role: 'michio', content: `Failed to move file: ${e.message}`, timestamp: respTimestamp }]);
                 }
             }

             if (tool.function.name === 'fetch_url') {
                 try {
                     const args = JSON.parse(tool.function.arguments);
                     const { url, destinationPath } = args;
                     
                     setMessages(prev => [...prev, { role: 'michio', content: `Fetching content from ${url}...`, timestamp: respTimestamp }]);

                     const res = await fetch('/api/utils/fetch-url', {
                        method: 'POST',
                        body: JSON.stringify({ url }),
                        headers: { 'Content-Type': 'application/json' }
                     });
                     const data = await res.json();
                     if (!res.ok) throw new Error(data.message);

                     // Summarize
                     let finalContent = data.content;
                     try {
                        const sumRes = await fetch('/api/ai/summarize', {
                            method: 'POST',
                            body: JSON.stringify({ content: data.content }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const sumData = await sumRes.json();
                        if (sumData.summary) {
                            finalContent = `> **Summary**: ${sumData.summary}\n\n> **Source**: ${url}\n\n---\n\n${data.content}`;
                        } else {
                            finalContent = `> **Source**: ${url}\n\n---\n\n${data.content}`;
                        }
                     } catch (e) {
                         console.error("Summary Failed", e);
                         finalContent = `> **Source**: ${url}\n\n---\n\n${data.content}`;
                     }

                     await storage.saveFile(destinationPath, finalContent);
                     
                     const msg = `Saved source from ${url} to *${destinationPath}*.`;
                     setMessages(prev => [...prev, { role: 'michio', content: msg, timestamp: respTimestamp }]);
                     await storage.appendFile(`history/${currentDate}.md`, `**Meechi**: ${msg}\n`);

                 } catch (e: any) {
                     console.error("Fetch URL Error", e);
                     setMessages(prev => [...prev, { role: 'michio', content: `Failed to fetch URL: ${e.message}`, timestamp: respTimestamp }]);
                 }
             }
        } // End of toolCalls loop
        } // End of if (toolCalls)

        // Normal Text Response
        // Only append to UI if NOT fallback (since fallback streams updates live)
        if (!isFallback && responseText) {
             setMessages(prev => [...prev, { 
                role: 'michio', 
                content: responseText, 
                timestamp: respTimestamp,
                usage: usageData ? { total_tokens: usageData.completion_tokens } : undefined
            }]);
        }
        
        // 4. Save Meechi Response Locally (If we have text content)
        // Check if responseText is valid and distinct from tool confirmation
        if (responseText && (!toolCalls || toolCalls.length === 0)) {
            // Extra safety: Strip any lingering tool tags that might have slipped through
            const cleanResponse = responseText.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '').trim();
            if (cleanResponse) {
                const michioEntry = `**Meechi**: ${cleanResponse}\n`;
                console.log("[Local AI] Saving response to history:", michioEntry.trim().substring(0, 50) + "...");
                await storage.appendFile(`history/${currentDate}.md`, michioEntry);
                console.log("[Local AI] History saved to", `history/${currentDate}.md`);
            }
        }

        // 5. Trigger Cloud Sync (if online)
        syncNow();

        scrollToBottom();
    } catch (err: any) {
      console.error("Chat Error:", err);
      setMessages(prev => [...prev, { role: 'michio', content: `(Entry saved. Offline mode: AI unavailable. Reason: ${err.message || 'Unknown'})` }]);
      scrollToBottom();
    } finally {
      setIsChatting(false);
    }
  }

  const handleDateSelect = (date: string) => {
      setCurrentDate(date);
      setIsCalendarOpen(false);
  };

  const handleOpenFile = async (path: string) => {
      try {
          const content = await storage.readFile(path);
          // Check if content is string (even empty string is valid)
          if (typeof content === 'string') {
              setViewingSource({ 
                  title: path.split('/').pop() || path, 
                  content 
              });
              setIsExplorerOpen(false); // Close Explorer if open
          } else {
              showMessage("Error", "Failed to read file content (empty or binary).");
          }
      } catch (e) {
          console.error("Read Error", e);
          showMessage("Error", "Error reading file.");
      }
  };

  // Helper to scroll to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
        if (streamRef.current) {
            streamRef.current.scrollTop = streamRef.current.scrollHeight;
        }
    }, 10);
  };

  function parseLogToMessages(log: string) {
    if (!log) return [];
    
    // Split by '### ' which denotes a new entry with timestamp
    // Format: "### 10:30:00 PM\n**User**: hello..."
    const chunks = log.split('### ').filter(c => c.trim());
    
    const msgs: {
        role: 'user' | 'michio', 
        content: string, 
        timestamp?: string,
        usage?: { total_tokens: number }
    }[] = [];

    chunks.forEach(chunk => {
      // Extract first line (timestamp)
      const lines = chunk.split('\n');
      const timestamp = lines[0]?.trim(); // "10:30:00 PM"
      const body = lines.slice(1).join('\n'); // Rest of message
      
      const userMatch = body.match(/\*\*User\*\*: ([\s\S]*?)(?=\n\*\*Meechi\*\*|\n\*\*Michio\*\*|$)/);
      const michioMatch = body.match(/\*\*(?:Meechi|Michio)\*\*: ([\s\S]*)/);
      
      if (userMatch && userMatch[1]) {
          msgs.push({ 
              role: 'user', 
              content: userMatch[1].trim(),
              timestamp 
          });
      }
      if (michioMatch && michioMatch[1]) {
          msgs.push({ 
              role: 'michio', 
              content: michioMatch[1].trim(),
              timestamp 
          });
      }
    });
    return msgs;
  }

  return (
    <main className={styles.main}>
      {/* 1. Header */}
      <header className={styles.header}>
        <div style={{display:'flex', alignItems: 'center', gap: 10}}>
             <button className={styles.dateTitle} onClick={() => setIsCalendarOpen(true)}>
                <span>{currentDate}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>▼</span>
             </button>

             <Link href="/settings">
                <button 
                    style={{
                        fontSize: '1.2rem', 
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer',
                        opacity: 0.7
                    }}
                    title="Settings"
                >
                    ⚙️
                </button>
             </Link>
             {/* Removed + Button */}
             
             <button 
                onClick={() => setIsExplorerOpen(true)}
                style={{
                    fontSize: '1.2rem', 
                    background: 'transparent', 
                    border: 'none', 
                    cursor: 'pointer',
                    marginLeft: '0.5rem',
                    opacity: 0.7
                }}
                title="File Explorer"
             >
                📁
             </button>

             {/* Model Indicator (Top Bar) */}
             <div style={{ marginLeft: '1rem', fontSize: '0.75rem', opacity: 0.7, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid rgba(128,128,128,0.3)', paddingLeft: '1rem' }}>
                <span title="Status">
                    {/* Heuristic: If we are in "Waking up" state, we are definitely trying Local. */
                     meechi.localAIStatus ? 'Sage (Local - Loading...)' : 
                     (meechi.isReady ? (meechi.isLowPowerDevice ? 'Sage 1B (Local)' : 'Sage 8B (Local)') : 'Sage (Local)')
                    }
                </span>
                {meechi.localAIStatus && <span className={styles.loadingDots}></span>}
             </div>
        </div>
        
        <div className={styles.authBadge}>
             <ThemeSwitcher />
             {session ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    {/* Session Usage Counter */}
                    <div style={{ fontSize: '0.75rem', opacity: 0.6, border: '1px solid currentColor', padding: '2px 6px', borderRadius: 4 }}>
                        ∑ Tokens: {sessionUsage.total}
                    </div>

                    {/* Sync Status Indicator */}
                    <div style={{ 
                        fontSize: '0.8rem', 
                        color: syncError ? 'red' : (isSyncing ? '#3b82f6' : '#10b981'),
                        display: 'flex', alignItems: 'center', gap: 4
                    }}>
                        <div style={{ 
                            width: 8, height: 8, borderRadius: '50%', 
                            background: syncError ? 'red' : (isSyncing ? '#3b82f6' : '#10b981'),
                            animation: isSyncing ? 'pulse 1s infinite' : 'none'
                        }} />
                        {syncError ? 'Error' : (isSyncing ? (syncMessage || 'Syncing...') : 'Online')}
                    </div>
                </div>
             ) : (
                <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    
                </div>
             )}
        </div>
      </header>
      
      {/* 2. Scrollable Chat Stream */}
      <div className={styles.chatContainer} ref={streamRef}>
             <div className={styles.chatStream}>
                {isLoadingHistory && messages.length === 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20vh' }}>
                        <div style={{ width: 20, height: 20, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    </div>
                )}
                
                {!isLoadingHistory && messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '10vh' }}>
                        <h1>Meechi</h1>
                        <p>Traveler, I am listening.</p>
                        {!session && <p style={{fontSize: '0.8rem', opacity: 0.6}}>(Guest Mode: History is saved on this device)</p>}
                    </div>
                )}
                
                {/* Load More Button */}
                {messages.length >= historyLimit && (
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <button 
                            onClick={() => setHistoryLimit(prev => prev + 20)}
                            style={{ 
                                background: '#f3f4f6', border: 'none', padding: '0.5rem 1rem', 
                                borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer', color: '#666'
                            }}
                        >
                            Load Older Messages
                        </button>
                    </div>
                )}
                
                {messages.map((msg, i) => (
                    <div key={i} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.michioMessage}`}>
                        <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 4, fontSize: '0.75rem', opacity: 0.6 
                        }}>
                             <strong>{msg.role === 'michio' ? 'Meechi' : 'You'}</strong>
                             <span>{msg.timestamp}</span>
                        </div>
                        
                        {msg.role === 'michio' ? (
                            <ReactMarkdown>
                                {(() => {
                                    const raw = msg.content;
                                    const isStartFunc = raw.trim().startsWith('<function');
                                    const isExec = raw.includes('Executing');
                                    if (isStartFunc && !isExec) console.log("[Page] Deep Thinking Triggered by:", raw);
                                    
                                    return (isStartFunc && !isExec)
                                        ? '🔄 Deep Thinking...' 
                                        : raw.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '').trim() || raw
                                })()}
                            </ReactMarkdown>
                        ) : (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        )}
                        
                        {msg.usage && (
                            <div style={{ 
                                fontSize: '0.65rem', opacity: 0.4, textAlign: 'right', marginTop: 4 
                            }}>
                                {msg.usage.total_tokens} tok
                            </div>
                        )}
                    </div>
                ))}
                
                {isLoadingHistory && messages.length > 0 && (
                     <div style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.5, margin: '1rem 0' }}>Syncing...</div>
                )}

                {isChatting && (
                    <div className={styles.michioMessage} style={{ fontStyle: 'italic', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{meechi.localAIStatus || "Thinking"}</span>
                        <span className={styles.loadingDots}></span>
                    </div>
                )}
             </div>
      </div>

      {/* 3. Fixed Input Area */}
      <div className={styles.inputArea}>

          {meechi.downloadProgress && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#666' }}>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>{meechi.downloadProgress.text}</div>
                  <div style={{ width: '100%', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ 
                          width: `${meechi.downloadProgress.percentage}%`, 
                          height: '100%', 
                          background: '#3b82f6',
                          transition: 'width 0.3s ease'
                      }} />
                  </div>
              </div>
          )}

         {!meechi.downloadProgress && (

            <form onSubmit={handleChat} className={styles.inputWrapper} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {/* Drag & Drop Overlay */}
                {isDragOver && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '2px dashed #3b82f6',
                        borderRadius: 8,
                        pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#3b82f6', fontWeight: 600,
                        zIndex: 10
                    }}>
                        Drop files here to attach
                    </div>
                )}
                
                {/* Attached Files Preview */}
                {attachedFiles.length > 0 && (
                    <div style={{ width: '100%', padding: '0 0.5rem 0.5rem 0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
                        {attachedFiles.map((f, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4 }}>
                                {f.name}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <textarea 
                        ref={textareaRef}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onDragEnter={() => setIsDragOver(true)}
                        onDragLeave={() => setIsDragOver(false)}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDrop={async (e) => {
                            e.preventDefault();
                            setIsDragOver(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                const files = Array.from(e.dataTransfer.files);
                                for (const file of files) {
                                    // Sanitize filename to strict ASCII to avoid encoding issues
                                    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_ ()]/g, '').replace(/\s+/g, ' ').trim();
                                    const path = `temp/${safeName}`;
                                    
                                    console.log(`[Drop] Saving ${file.name} to ${path}`);

                                    // Simple Save (Binary or Text)
                                    if (file.type.startsWith('text/') || file.name.endsWith('.md')) {
                                        const text = await file.text();
                                        await storage.saveFile(path, text);
                                    } else {
                                        const buffer = await file.arrayBuffer();
                                        await storage.saveFile(path, buffer);
                                    }
                                    
                                    // Double check existence
                                    const exists = await storage.getFile(path);
                                    if (!exists) console.error(`[Drop] VERIFICATION FAILED for ${path}`);
                                    else console.log(`[Drop] Verified ${path} exists in DB`);

                                    setAttachedFiles(prev => [...prev, { name: safeName, path }]);
                                }
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleChat(e as any);
                            }
                        }}
                        placeholder={meechi.isLowPowerDevice ? "Meechi is in Low-Power mode to save your battery." : "Message Meechi... (Drag & Drop files)"}
                        className={styles.chatInput}
                        rows={1}
                    />
                    <button type="submit" disabled={isChatting} className={styles.sendBtn}>
                        {isChatting ? (
                            <span style={{ fontSize: '1.2rem', animation: 'spin 1s linear infinite' }}>⟳</span>
                        ) : (
                            <span>↑</span>
                        )}
                    </button>
                </div>
            </form>
         )}

      </div>

      {/* 4. Calendar Modal */}
      {isCalendarOpen && (
          <div className={styles.modalOverlay} onClick={() => setIsCalendarOpen(false)}>
              <div onClick={e => e.stopPropagation()}>
                <CalendarView onClose={() => setIsCalendarOpen(false)} />
              </div>
          </div>
      )}
      
      {isSourceModalOpen && (
          <AddSourceModal 
            onClose={() => setIsSourceModalOpen(false)} 
            onSave={handleSaveSource}
          />
      )}

      {isExplorerOpen && (
        <FileExplorer 
            storage={storage} 
            onClose={() => setIsExplorerOpen(false)} 
            syncLogs={syncLogs} 
            onOpenFile={(path) => {
                handleOpenFile(path);
                setReturnToExplorer(true);
            }} 
        />
      )}

      {viewingSource && (
        <SourceViewer 
            title={viewingSource.title} 
            content={viewingSource.content} 
            onClose={() => {
                setViewingSource(null);
                if (returnToExplorer) {
                    setIsExplorerOpen(true);
                    setReturnToExplorer(false);
                }
            }} 
        />
      )}

      {messageModal && (
          <div className={styles.modalOverlay} onClick={() => setMessageModal(null)}>
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: 8, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ marginTop: 0 }}>{messageModal.title}</h3>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{messageModal.message}</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setMessageModal(null)} style={{ background: '#007bff', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 4, cursor: 'pointer' }}>OK</button>
                  </div>
              </div>
          </div>
      )}
    </main>
  );
}
