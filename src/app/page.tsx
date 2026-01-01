'use client';
import { useSession, signIn, signOut } from "next-auth/react";
import { localLlmService } from "@/lib/ai/local-llm";
import { AIChatMessage } from "@/lib/ai/types";
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from "react";
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

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput("");
    setIsChatting(true);
    scrollToBottom();
    
    const timestamp = new Date().toLocaleTimeString();
    
    // 1. Save User Message Locally
    let logEntry = `### ${timestamp}\n**User**: ${userMsg}\n`;
    if (attachedFiles.length > 0) {
        const attInfo = attachedFiles.map(f => `[Attached: ${f.path}]`).join(', ');
        logEntry = `### ${timestamp}\n**User**: ${userMsg}\n${attInfo}\n`;
    }
    await storage.appendFile(`history/${currentDate}.md`, logEntry);
    
    // Estimate tokens
    const estimatedTokens = Math.ceil(userMsg.length / 4);
    setMessages(prev => {
        const newArr = [...prev];
        return newArr;
    });

    // 2. Read Context (STRICTLY Conditional)
    let knowledgeContext = "";
    if (meechi.mode === 'research') {
        console.log(`[Page] Research Mode: Retrieving Context...`);
        // This will acquire the GPU Lock for Embeddings
        knowledgeContext = await storage.getKnowledgeContext(userMsg);
        console.log(`[Page] RAG Retrieval: ${knowledgeContext.length} chars found`);
    } else {
        console.log(`[Page] ${meechi.mode} Mode: Skipping RAG`);
    }
    
    // Read local conversation history (Fast, no GPU)
    const localHistory = await storage.getRecentLogs(6); 
    
    let fullContext = `${knowledgeContext}\n\n--- Current Conversation History (Last 6h) ---\n${localHistory}`;
    if (attachedFiles.length > 0) {
        fullContext += `\n\n[SYSTEM: User has attached files. Look at 'temp/' folder if needed. Tools available: move_file, fetch_url.]`;
        setAttachedFiles([]);
    }

    // 3. LOG MODE: Stop here.
    if (meechi.mode === 'log') {
        setIsChatting(false);
        return; 
    }

    // 4. CHAT/RESEARCH MODE: Proceed to AI
    const historyForAI: AIChatMessage[] = messages.slice(-10).map(m => ({
        role: m.role === 'michio' ? 'assistant' : 'user',
        content: m.content
    }));

    const respTimestamp = new Date().toLocaleTimeString();
    let currentContent = "";
    
    // Add placeholder for Assistant
    setMessages(prev => [...prev, { role: 'michio', content: "...", timestamp: respTimestamp }]);

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
        const finalLogEntry = `### ${respTimestamp}\n**Meechi**: ${currentContent}\n\n`;
        await storage.appendFile(`history/${currentDate}.md`, finalLogEntry);
    }
    
    setIsChatting(false);
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

  // Effect: Auto-scroll on new messages
  useEffect(() => {
      if (messages.length === 0) return;

      const isUserMsg = messages[messages.length - 1].role === 'user';
      
      // If it's the User's message, we always smooth scroll to acknowledge it.
      if (isUserMsg) {
         scrollToBottom('smooth');
      } 
      // If it's the FIRST load (hasn't scrolled yet), we INSTANT scroll (behavior: auto).
      else if (!hasScrolledRef.current) {
         scrollToBottom('instant'); // 'instant' or 'auto'
         hasScrolledRef.current = true;
      }
      // If none of the above (e.g. AI streaming), preserve standard behavior
      // (Scroll if near bottom)
      else if (streamRef.current) {
           const { scrollTop, scrollHeight, clientHeight } = streamRef.current;
           const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;
           if (isAtBottom) scrollToBottom('smooth');
      }
  }, [messages]);

  // Effect: Initial Load
  useEffect(() => {
    async function load() {
        if (currentDate) {
            setIsLoadingHistory(true);
            try {
                await storage.init();
                const content = await storage.readFile(`history/${currentDate}.md`) || "";

                if (content && typeof content === 'string' && !content.startsWith("No journal")) {
                    // SANITIZATION
                    let cleanContent = content.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '');
                    cleanContent = cleanContent.replace(/^\*\*Meechi\*\*: Settings updated.*?(\n|$)/gmi, ""); 
                    cleanContent = cleanContent.replace(/^\*\*Meechi\*\*: I will call you.*?(\n|$)/gmi, "");
                    cleanContent = cleanContent.replace(/Settings updated\. I will call you.*?(\n|$)/gmi, "");

                    if (cleanContent.length !== content.length) {
                        await storage.saveFile(`history/${currentDate}.md`, cleanContent);
                    }

                    const parsed = parseLogToMessages(cleanContent);
                    const visibleMessages = parsed.slice(-historyLimit);
                    setMessages(visibleMessages);
                    // (Scroll is handled by the useEffect above triggers on 'messages')
                } else {
                    setMessages([]);
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
  }, [currentDate, storage, historyLimit]);

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
                            (() => {
                                const raw = msg.content;
                                // Clean generic placeholder
                                if (raw.trim() === '...' || raw.trim() === '…') {
                                    return <span style={{ animation: 'pulse 1.5s infinite', opacity: 0.7 }}>💡 Deep Thinking...</span>;
                                }

                                const cleaned = raw.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '').trim();
                                const isStartFunc = raw.trim().startsWith('<function');
                                
                                // Show "Using Tools" only if we have a function block BUT no human text yet
                                if (isStartFunc && !cleaned) {
                                    return <span style={{ animation: 'pulse 1.5s infinite', opacity: 0.7 }}>🛠️ Using Tools...</span>;
                                }

                                return (
                                    <ReactMarkdown>
                                        {cleaned || raw}
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
                ))}
                
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
                        <div style={{ color: 'red', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            ⚠ GPU Driver Crashed
                        </div>
                        <button 
                            onClick={() => window.location.reload()}
                            style={{
                                background: '#ef4444', color: 'white', border: 'none',
                                padding: '0.5rem 1rem', borderRadius: 6,
                                cursor: 'pointer', fontSize: '0.9rem',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                            }}
                        >
                            ⟳ Reload AI to Fix
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
              ↓
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
                                {m === 'log' && '📝 Log'}
                                {m === 'chat' && '💬 Chat'}
                                {m === 'research' && '🔍 Research'}
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
                    <button type="submit" disabled={isChatting} className={styles.sendBtn}>
                        {isChatting ? (
                            <span style={{ fontSize: '1.2rem', animation: 'spin 1s linear infinite' }}>⟳</span>
                        ) : (
                            <span>↑</span>
                        )}
                    </button>
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
