'use client';
import { useSession, signIn, signOut } from "next-auth/react";
import { localLlmService } from "@/lib/ai/local-llm";
import { AIChatMessage } from "@/lib/ai/types";
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from "react";
import styles from './page.module.css';
import CalendarView from '@/components/CalendarView';
import { LocalStorageProvider } from '@/lib/storage/local';

import Icon from '@/components/Icon';

const ModeIcon = ({ mode }: { mode: string }) => {
    switch (mode.toLowerCase()) {
        case 'log': return <Icon name="FileText" size={16} />;
        case 'research': return <Icon name="Search" size={16} />;
        case 'chat': return <Icon name="MessageCircle" size={16} />;
        default: return null;
    }
};
import { settingsManager } from '@/lib/settings';
import { useSync } from '@/hooks/useSync';
import { useMeechi } from '@/hooks/useMeechi';
import AddSourceModal from '@/components/AddSourceModal';
import FileExplorer from '@/components/FileExplorer';
import SourceEditor from '@/components/SourceEditor';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export default function Home() {
  const { data: session, update } = useSession();
  const [chatInput, setChatInput] = useState("");
  // Messages now hold more metadata
  const [messages, setMessages] = useState<{
      role: 'user' | 'michio', 
      content: string, 
      timestamp?: string, 
      fullDate?: Date,
      mode?: string,
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
  
  // Updated ViewingSource State
  const [viewingSource, setViewingSource] = useState<{
      path: string;
      content: string;
      tags?: string[];
      metadata?: any;
  } | null>(null);
  
  // Message Modal State
  const [messageModal, setMessageModal] = useState<{title: string, message: string} | null>(null);
  const showMessage = (title: string, message: string) => setMessageModal({ title, message });
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
  


  // Pre-load Local AI on Mount
  // Pre-load Local AI logic moved to useMeechi hook



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
              const prompt = `Summarize the following content in 1-2 sentences. Start with "The content discusses...":\n\n${content.substring(0, 2000)}`;
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



  const handleDateSelect = (date: string) => {
      setCurrentDate(date);
      setIsCalendarOpen(false);
  };

  const handleOpenFile = async (path: string) => {
      try {
          console.log('[Page] Opening file:', path);
          const file = await storage.getFile(path);
          // getFile returns metadata (tags, etc) but usually not content
          if (file) {
               console.log('[Page] File metadata retrieved:', file.metadata);
               console.log('[Page] Comments count:', file.metadata?.comments?.length || 0);
               const content = await storage.readFile(path);
               
               if (typeof content === 'string') {
                     setViewingSource({ 
                         path: file.path, 
                         content: content,
                         tags: file.tags || [],
                         metadata: file.metadata || {}
                     });
                     console.log('[Page] File opened successfully');
                     setIsExplorerOpen(false);
               } else {
                   showMessage("Error", "Binary content. Cannot open.");
               }
          } else {
              // Fallback if getFile fails but readFile works? (Shouldn't happen if file exists)
              const content = await storage.readFile(path);
              if (typeof content === 'string') {
                  setViewingSource({ path: path, content, tags: [], metadata: {} });
                  setIsExplorerOpen(false);
              } else {
                  showMessage("Error", "Failed to read file.");
              }
          }
      } catch (e) {
          console.error("[Page] Read Error", e);
          showMessage("Error", "Error reading file.");
      }
  };

  const handleEditorSave = async (content: string, tags: string[], metadata: any) => {
      if (!viewingSource) return;
      
      try {
          await storage.saveFile(viewingSource.path, content, undefined, tags, metadata);
          
          // Update local view state
          setViewingSource(prev => prev ? ({ ...prev, content, tags, metadata }) : null);
          
          showMessage("Saved", `Saved ${viewingSource.path}`);
          syncNow(); // Trigger background sync
      } catch (e) {
          console.error("Save failed", e);
          showMessage("Error", "Failed to save file.");
      }
  };

  const handleUpdateMetadata = async (tags: string[], metadata: any) => {
      if (!viewingSource) return;
      try {
          console.log('[Page] handleUpdateMetadata called for:', viewingSource.path);
          console.log('[Page] Metadata comments count:', metadata?.comments?.length || 0);
          await storage.updateMetadata(viewingSource.path, { tags, metadata });
          console.log('[Page] Storage.updateMetadata completed');
          setViewingSource(prev => prev ? ({ ...prev, tags, metadata }) : null);
          console.log('[Page] Local state updated');
          syncNow();
      } catch (e) {
          console.error("[Page] Metadata update failed", e);
      }
  };


  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    // Clear any pending scroll timeouts to avoid conflicts
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    scrollTimeoutRef.current = setTimeout(() => {
        if (streamRef.current) {
            streamRef.current.scrollTo({
                top: streamRef.current.scrollHeight,
                behavior: behavior
            });
        }
    }, 50); // Small delay to ensure layout is done
  };

  const handleScroll = () => {
      if (!streamRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = streamRef.current;
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100; // 100px threshold
      setShowScrollButton(!isAtBottom);
  };

  // Helper: Format Time for UI
  const formatMessageTime = (date?: Date, includeDate = false) => {
      if (!date) return '';
      // 24h format: HH:mm
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      
      if (includeDate) {
          const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
          return `${dateStr} ${timeStr}`; // 1/15 14:30
      }
      return timeStr;
  };



    // Helper: Parse Log with Mode and Date Context
  function parseLogToMessages(log: string, dateStr: string) {
    if (!log) return [];
    
    // Split by '### ' which denotes a new entry with timestamp
    // Format: "### 10:30:00 PM [Mode: chat]" OR "### 22:30 [Mode: chat]"
    const chunks = log.split('### ').filter(c => c.trim());
    
    const msgs: {
        role: 'user' | 'michio', 
        content: string, 
        timestamp?: string,
        fullDate?: Date,
        mode?: string, // Added Mode
        usage?: { total_tokens: number }
    }[] = [];

    chunks.forEach(chunk => {
        // Extract Header Line (Timestamp + Optionals)
        const headerEndFn = chunk.indexOf('\n');
        const headerLine = chunk.substring(0, headerEndFn).trim(); 
        const body = chunk.substring(headerEndFn + 1);

        // Parse Timestamp: "10:30:00 PM" or "22:30:00"
        const timeMatch = headerLine.match(/^(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)/i);
        const timestampRaw = timeMatch ? timeMatch[1] : undefined;

        // Parse Mode: "[Mode: research]"
        const modeMatch = headerLine.match(/\[Mode:\s*(\w+)\]/i);
        const mode = modeMatch ? modeMatch[1] : undefined;

        // Construct Full Date Object for Sorting
        let fullDate: Date | undefined;
        if (timestampRaw && dateStr) {
             const [timePart, modifier] = timestampRaw.trim().split(' ');
             let [hours, minutes, seconds] = timePart.split(':').map(Number);
             
             if (modifier) {
                 if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
                 if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
             }
             
             // Create date from file date (YYYY-MM-DD)
             const [y, m, d] = dateStr.split('-').map(Number);
             fullDate = new Date(y, m - 1, d, hours || 0, minutes || 0, seconds || 0);
        }

        // Parse Body for Role and Content
        if (body.includes('**User**:')) {
             const content = body.replace('**User**:', '').trim();
             msgs.push({ role: 'user', content, timestamp: timestampRaw, fullDate, mode });
        } else if (body.includes('**Meechi**:')) {
             const content = body.replace('**Meechi**:', '').trim();
             msgs.push({ role: 'michio', content, timestamp: timestampRaw, fullDate, mode });
        }
    });

    return msgs;
  }

  // Effect: Initial Load (Continuous History)
  useEffect(() => {
    async function loadContinuousHistory() {
        if (!currentDate) return;
        
        setIsLoadingHistory(true);
        try {
            await storage.init();
            
            let allMessages: any[] = [];
            let userTurnCount = 0;
            const MIN_USER_TURNS = 20;
            const MAX_USER_TURNS = 30;

            // Start from selected date (usually today)
            const [y, m, d] = currentDate.split('-').map(Number);
            let loopDate = new Date(y, m - 1, d);
            
            // Loop backwards until we have enough USER turns
            for (let i = 0; i < 365; i++) {
                const dateStr = formatDateForFile(loopDate);
                const content = await storage.readFile(`history/${dateStr}.md`);

                if (content && typeof content === 'string' && !content.startsWith("No journal")) {
                     // SANITIZATION
                    let cleanContent = content.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '');
                    cleanContent = cleanContent.replace(/^\*\*Meechi\*\*: Settings updated.*?(\n|$)/gmi, ""); 
                    cleanContent = cleanContent.replace(/^\*\*Meechi\*\*: I will call you.*?(\n|$)/gmi, "");
                    cleanContent = cleanContent.replace(/Settings updated\. I will call you.*?(\n|$)/gmi, "");

                    if (cleanContent.length !== content.length) {
                         if (dateStr === currentDate) {
                             await storage.saveFile(`history/${dateStr}.md`, cleanContent);
                         }
                    }

                    const parsed = parseLogToMessages(cleanContent, dateStr);
                    
                    // Prepend to array (since we are going backwards in time)
                    allMessages = [...parsed, ...allMessages];
                    
                    // Count User Turns in this chunk
                    userTurnCount += parsed.filter(m => m.role === 'user').length;
                }

                if (userTurnCount >= MIN_USER_TURNS) break;

                // Go to previous day
                loopDate.setDate(loopDate.getDate() - 1);
            }

            // Trimming Logic: Keep Max 30 User Turns
            const totalUserMessages = allMessages.filter(m => m.role === 'user');
            if (totalUserMessages.length > MAX_USER_TURNS) {
                // Find the Nth user message from the end (where N = MAX)
                // We want the last 30 user messages.
                // The index of the first user message we want is: length - 30
                const cutoffIndex = totalUserMessages.length - MAX_USER_TURNS;
                
                // Now find the actual index in allMessages corresponding to that user message
                let userCount = 0;
                let splitIndex = 0;
                
                for (let i = 0; i < allMessages.length; i++) {
                    if (allMessages[i].role === 'user') {
                        userCount++;
                        if (userCount === cutoffIndex + 1) { // This is the first one we keep
                             splitIndex = i;
                             break;
                        }
                    }
                }
                
                // Slice from that index
                allMessages = allMessages.slice(splitIndex);
            }

            // Fallback: If empty, check onboarding
            if (allMessages.length === 0) {
                 const config = await settingsManager.getConfig();
                 if (config.identity.name === 'Traveler') {
                      allMessages = [{
                          role: 'michio',
                          content: "Hello! I am Michio, your personal cognitive partner. We haven't been properly introduced yet. What should I call you?",
                          timestamp: formatMessageTime(new Date()),
                          fullDate: new Date(),
                          mode: 'chat'
                      }];
                 }
            }
            
            setMessages(allMessages);
            
            // Initial Scroll Logic
            if (allMessages.length > 0) {
                setTimeout(() => {
                    if (streamRef.current) {
                        streamRef.current.scrollTop = streamRef.current.scrollHeight;
                        hasScrolledRef.current = true;
                    }
                }, 50); 
            }

        } catch (err) {
            console.error("Failed to load history", err);
        } finally {
            setIsLoadingHistory(false);
        }
    }
    loadContinuousHistory();
  }, [currentDate, storage]); 


  // Helper: Relative Time Formatter (Time Ago)
  function getRelativeTime(date1: Date, fromDate: Date) {
      // Calculate diff from 'fromDate' (usually NOW) to 'date1' (message time)
      const diffMs = fromDate.getTime() - date1.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
          return diffDays === 1 ? "Yesterday" : `${diffDays} days ago`;
      }
      if (diffHours > 0) {
          return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      }
      return null;
  }

  // Helper: Format Date for filename
  const formatDateForFile = (date: Date) => {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Auto-scroll during active chat (streaming)
  // We use a dummy div at the bottom of the list (messagesEndRef)
  useEffect(() => {
      if (isChatting) {
           // Small timeout to ensure DOM is painted
           setTimeout(() => {
               messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
           }, 10);
      }
  }, [messages, isChatting]);

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    // Current Time for UI (24h)
    const now = new Date();
    // We store fullDate, rendering will handle formatting
    const timestampDisplay = formatMessageTime(now); 

    // Optimistic Update
    setMessages(prev => [...prev, { 
        role: 'user', 
        content: userMsg, 
        timestamp: timestampDisplay,
        fullDate: now,
        mode: meechi.mode
    }]);
    
    setChatInput("");
    setIsChatting(true);
    scrollToBottom();
    
    // 1. Save User Message Locally (With Mode Tag & 24h Time)
    // Format: "### 22:30 [Mode: chat]"
    // Use standard 24h string for storage "22:30:00"
    // CRITICAL: We MUST enforce seconds, otherwise the reader regex might fail or locale might vary.
    const storageTime = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let logEntry = `### ${storageTime} [Mode: ${meechi.mode}]\n**User**: ${userMsg}\n`;
    if (attachedFiles.length > 0) {
        const attInfo = attachedFiles.map(f => `[Attached: ${f.path}]`).join(', ');
        logEntry = `### ${storageTime} [Mode: ${meechi.mode}]\n**User**: ${userMsg}\n${attInfo}\n`;
    }
    await storage.appendFile(`history/${currentDate}.md`, logEntry);
    
    // Estimate tokens
    setMessages(prev => {
        const newArr = [...prev];
        return newArr;
    });

    // 2. LOG MODE: Stop here. No AI interaction.
    // The user message is already added/saved above.
    if (meechi.mode === 'log') {
        setIsChatting(false);
        // We do trigger indexing for the log entry later (async), but we don't need to wait or show UI for it.
        // Actually, indexing happens in storage.appendLog, so it's auto-handled.
        return; 
    }

    // 3. Add placeholder (IMMEDIATE FEEDBACK for Chat/Research)
    // We add this BEFORE RAG/AI starts so the user sees "Thinking..." instantly.
    const respTimestamp = new Date().toLocaleTimeString([], { hour12: false });
    const respTimeDisplay = formatMessageTime(new Date()); 
    const placeholderDate = new Date();

    setMessages(prev => [...prev, { 
        role: 'michio', 
        content: "...", 
        timestamp: respTimeDisplay,
        fullDate: placeholderDate,
        mode: meechi.mode
    }]);

    // 4. Read Context (Chat & Research)
    let knowledgeContext = "";
    // ALWAYS run RAG. In Chat mode, it helps with Long-Term Memory (searching history).
    // In Research mode, it helps with deep knowledge.
    console.log(`[Page] Mode: ${meechi.mode}. Retrieving Context...`);
    
    try {
        knowledgeContext = await storage.getKnowledgeContext(userMsg);
        console.log(`[Page] RAG Retrieval: ${knowledgeContext.length} chars found`);
    } catch (err) {
        console.error("RAG Failed", err);
    }
    
    // Read local conversation history (24h Window for Daily Context)
    const rawLocalHistory = await storage.getRecentLogs(24);
    
    // SAFE TRUNCATION STRATEGY (1B Model Support)
    // 1. Limit History to recent 2000 chars (Immediate context)
    const SAFE_HISTORY_LIMIT = 2000;
    const safeHistory = rawLocalHistory.length > SAFE_HISTORY_LIMIT 
        ? "..." + rawLocalHistory.substring(rawLocalHistory.length - SAFE_HISTORY_LIMIT) 
        : rawLocalHistory;

    // 2. Limit RAG to 6000 chars (Deep context)
    const SAFE_RAG_LIMIT = 6000;
    const safeRAG = knowledgeContext.length > SAFE_RAG_LIMIT
        ? knowledgeContext.substring(0, SAFE_RAG_LIMIT) + "..."
        : knowledgeContext;

    console.log(`[Page] Context Assembled: RAG(${safeRAG.length}) + History(${safeHistory.length})`);
    
    let fullContext = `${safeRAG}\n\n--- Daily History Log (Past 24h of User Activity) ---\n${safeHistory}`;
    if (attachedFiles.length > 0) {
        fullContext += `\n\n[SYSTEM: User has attached files. Look at 'temp/' folder if needed. Tools available: move_file, fetch_url.]`;
        setAttachedFiles([]);
    }

    // 6. CHAT/RESEARCH MODE: Proceed to AI
    const historyForAI: AIChatMessage[] = messages.slice(-10).map(m => ({
        role: m.role === 'michio' ? 'assistant' : 'user',
        content: m.content
    }));

    let currentContent = "";
    
    await meechi.chat(
        userMsg,
        historyForAI,
        fullContext,
        (chunk) => {
             currentContent += chunk;
             setMessages(prev => {
                const newArr = [...prev];
                const lastIdx = newArr.length - 1;
                // Ensure we are updating the assistant message
                if (newArr[lastIdx] && newArr[lastIdx].role === 'michio') {
                     newArr[lastIdx] = { ...newArr[lastIdx], content: currentContent };
                }
                return newArr;
             });
        },
        (toolName) => {
             // Optional: Show tool activity?
             console.log(`[UI] Tool execution started: ${toolName}`);
        },
        async (toolResult) => {
            // Append tool result to content
            currentContent += toolResult;
            
             setMessages(prev => {
                const newArr = [...prev];
                const lastIdx = newArr.length - 1;
                if (newArr[lastIdx] && newArr[lastIdx].role === 'michio') {
                     newArr[lastIdx] = { ...newArr[lastIdx], content: currentContent };
                }
                return newArr;
             });
        }
    );

    // 5. Final Save to History
    if (currentContent) {
        const finalLogEntry = `### ${respTimestamp} [Mode: ${meechi.mode}]\n**Meechi**: ${currentContent}\n\n`;
        await storage.appendFile(`history/${currentDate}.md`, finalLogEntry);
    }
    
    setIsChatting(false);
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
                    <Icon name="Settings" size={22} />
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

                <Icon name="FolderOpen" size={24} />
            </button>

             {/* Model Indicator (Top Bar) */}
             <div style={{ marginLeft: '1rem', fontSize: '0.75rem', opacity: 0.7, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid rgba(128,128,128,0.3)', paddingLeft: '1rem' }}>
                <span title="Status">
                    {meechi.localAIStatus ? 'Sage (Local - Loading...)' : 
                     (meechi.loadedModel ? `Sage (${meechi.loadedModel.includes('1B') ? '1B' : '8B'} Local)` : 'Sage (Local)')
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
      <div 
        className={styles.chatContainer} 
        ref={streamRef}
        onScroll={handleScroll}
      >
             <div className={styles.chatStream} style={{ opacity: isLoadingHistory && !hasScrolledRef.current ? 0 : 1, transition: 'opacity 0.2s ease' }}>
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
                
                {messages.map((msg, i) => {
                    // Time Divider Logic
                    let timeDivider = null;
                    const isPreviousDay = msg.fullDate && currentDate && msg.fullDate.getDate() !== new Date().getDate(); // Check if msg is from diff day
                    
                    if (i > 0 && msg.fullDate && messages[i-1].fullDate) {
                        const gap = msg.fullDate.getTime() - messages[i-1].fullDate!.getTime();
                        if (gap > 7200000) { // 2 hours
                            // Use NOW to show "X hours ago" instead of gap size
                            const relativeText = getRelativeTime(msg.fullDate, new Date()); 
                            if (relativeText) {
                                timeDivider = (
                                    <div className={styles.timeDivider}>
                                        {relativeText}
                                    </div>
                                );
                            }
                        }
                    }

                    // For previous days, show Date + Time
                    const displayTime = msg.fullDate 
                        ? formatMessageTime(msg.fullDate, msg.fullDate.toDateString() !== new Date().toDateString())
                        : msg.timestamp;

                    return (
                    <div key={i}>
                        {timeDivider}
                        <div className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.michioMessage}`}>
                            <div style={{ 
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: 4, fontSize: '0.75rem', opacity: 0.6,
                                gap: '1rem'
                            }}>
                                <strong>{msg.role === 'michio' ? 'Meechi' : 'You'}</strong>
                                <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                    {msg.mode && <span title={msg.mode}><ModeIcon mode={msg.mode} /></span>}
                                    {displayTime}
                                </span>
                            </div>
                            
                            {msg.role === 'michio' ? (
                                (() => {
                                    const raw = msg.content;
                                    // Clean generic placeholder
                                    if (raw.trim() === '...' || raw.trim() === '…') {
                                        const isResearch = msg.mode === 'research';
                                        return (
                                            <span style={{ 
                                                animation: 'pulse 2s infinite ease-in-out', 
                                                opacity: 0.8, 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: 8,
                                                color: 'var(--accent)',
                                                fontWeight: 500
                                            }}>
                                                <Icon name={isResearch ? "Brain" : "MessageCircle"} size={18} /> 
                                                {isResearch ? "Deep thinking..." : "Thinking"}
                                            </span>
                                        );
                                    }

                                    const cleaned = raw.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '').trim();
                                    const isStartFunc = raw.trim().startsWith('<function');
                                    
                                    // Show "Using Tools" only if we have a function block BUT no human text yet
                                    if (isStartFunc && !cleaned) {
                                        return <span style={{ animation: 'pulse 1.5s infinite', opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="Hammer" size={16} /> Using Tools...</span>;
                                    }

                                    let displayContent = cleaned || raw;

                                    // VISUAL FILTER: Hide "Reference" sections if the model persists in generating them (1B Model quirk)
                                    // Robust Regex: Matches Newline + (Markup) + Word + (Markup/Colon/Space mix) + Newline
                                    // Handles: "**Reference:**", "**References**:", "### Sources", etc.
                                    const refIndex = displayContent.search(/(\n|^)\s*([*#_>]*)\s*(?:Reference|Source|Bibliograph|Citation|Resource)s?\s*([*#_]*)\s*:?\s*([*#_]*)\s*(?:\n|$)/i);
                                    
                                    if (refIndex !== -1) {
                                         displayContent = displayContent.substring(0, refIndex).trim();
                                    }

                                    return (
                                        <ReactMarkdown>
                                            {displayContent}
                                        </ReactMarkdown>
                                    );
                                })()
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
                    </div>
                    );
                })}
                <div ref={messagesEndRef} style={{ float: "left", clear: "both" }} />
                
                {isLoadingHistory && messages.length > 0 && (
                     <div style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.5, margin: '1rem 0' }}>Syncing...</div>
                )}

                {isChatting && meechi.localAIStatus && (meechi.localAIStatus.includes('Waking') || meechi.localAIStatus.includes('%')) && (
                    <div className={styles.michioMessage} style={{ fontStyle: 'italic', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{meechi.localAIStatus}</span>
                        <span className={styles.loadingDots}></span>
                    </div>
                )}

                {meechi.localAIStatus && meechi.localAIStatus.includes("Crashed") && (
                    <div style={{ textAlign: 'center', margin: '1rem' }}>
                        <div style={{ color: '#ef4444', marginBottom: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Icon name="AlertTriangle" size={18} /> GPU Driver Crashed
                        </div>
                        <button 
                            onClick={() => window.location.reload()}
                            style={{
                                background: '#ef4444', color: 'white', border: 'none',
                                padding: '0.5rem 1rem', borderRadius: 6,
                                cursor: 'pointer', fontSize: '0.9rem',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
                                display: 'flex', alignItems: 'center', gap: 6
                            }}
                        >
                            <Icon name="LogOut" size={16} /> Reload AI to Fix
                        </button>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>
                            Tip: If crashes persist, try the <b>1B Model</b> in Settings.
                        </div>
                    </div>
                )}
             </div>
      </div>

       {/* Floating Scroll Button */}
       {showScrollButton && (
          <button 
            onClick={() => scrollToBottom('smooth')}
            style={{
                position: 'fixed',
                bottom: '100px',
                right: '30px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                zIndex: 50,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem'
            }}
            title="Scroll to Bottom"
          >
              <Icon name="ArrowDown" size={20} />
          </button>
      )}

      {/* 3. Fixed Input Area */}

      <div className={styles.inputArea}>

          {meechi.downloadProgress && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#666' }}>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>{meechi.downloadProgress.text}</div>
                  <div style={{ width: '100%', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ 
                          width: `${meechi.downloadProgress.percentage}%`, 
                          height: '100%', 
                          background: 'var(--accent)',
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

                <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end', gap: '0.5rem', flexDirection: 'column' }}>
                    
                    {/* MODE SELECTOR */}
                    <div style={{ 
                        alignSelf: 'flex-start', 
                        display: 'flex', 
                        gap: '0.25rem', 
                        padding: '2px', 
                        background: 'var(--surface)', 
                        borderRadius: 8, 
                        marginBottom: 4,
                        border: '1px solid var(--border)' 
                    }}>
                        {(['log', 'chat', 'research'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => meechi.setMode(m)}
                                style={{
                                    background: meechi.mode === m ? 'var(--accent)' : 'transparent',
                                    color: meechi.mode === m ? 'var(--background)' : 'var(--secondary)',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '4px 8px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex', alignItems: 'center', gap: 4
                                }}
                            >
                                {m === 'log' && <><Icon name="FileText" size={14} /> Log</>}
                                {m === 'chat' && <><Icon name="MessageCircle" size={14} /> Chat</>}
                                {m === 'research' && <><Icon name="Search" size={14} /> Research</>}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <textarea 
                        ref={textareaRef}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={
                            meechi.mode === 'log' ? "Write to your Ship's Log..." :
                            meechi.mode === 'research' ? "Ask a grounded question (Strict RAG)..." :
                            "Ask Meechi anything... (Creative)"
                        }
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
                        className={styles.chatInput}
                        rows={1}
                        style={{ width: '100%' }}
                    />
                    {isChatting ? (
                        <button 
                            type="button" 
                            onClick={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation();
                                meechi.stop(); 
                                // Force local state reset if needed, though stop() usually handles it
                            }} 
                            className={styles.sendBtn} 
                            style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                background: 'var(--destructive)', // OKLCH Derived Red
                                color: 'white',
                                position: 'relative'
                            }}
                            title="Stop Generation"
                        >
                             {/* Spinning Ring */}
                            <div style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                margin: 'auto',
                                width: '24px', height: '24px',
                                borderRadius: '50%',
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderTopColor: 'white',
                                animation: 'spin 1s linear infinite'
                            }} />

                            {/* Stop Icon (Centered) */}
                            <div style={{ zIndex: 2 }}>
                                <Icon name="Square" size={10} fill="currentColor" />
                            </div>
                            
                            {/* Inline Styles for Keyframe (if not in CSS) */}
                            <style jsx>{`
                                @keyframes spin {
                                    from { transform: rotate(0deg); }
                                    to { transform: rotate(360deg); }
                                }
                            `}</style>
                        </button>
                    ) : (
                        <button type="submit" className={styles.sendBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="ArrowUp" size={20} />
                        </button>
                    )}
                    </div>
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
          <SourceEditor 
              file={{
                  path: viewingSource.path,
                  content: viewingSource.content,
                  tags: viewingSource.tags,
                  metadata: viewingSource.metadata
              }}
              onSave={handleEditorSave}
              onUpdateMetadata={handleUpdateMetadata}
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
