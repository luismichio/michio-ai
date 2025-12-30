'use client';
import { useSession, signIn, signOut } from "next-auth/react";
import Link from 'next/link';
import { useState, useRef, useEffect } from "react";
import GuestJournal from './components/GuestJournal';
import styles from './page.module.css';
import CalendarView from './components/CalendarView';

// ... imports
import { LocalStorageProvider } from '@/lib/storage/local';
import { settingsManager } from '@/lib/settings';
import { useSync } from '@/hooks/useSync';
import AddSourceModal from './components/AddSourceModal';
import FileExplorer from './components/FileExplorer';
import SourceViewer from './components/SourceViewer';

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
  
  // Storage Provider
  const [storage] = useState(() => new LocalStorageProvider());

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
      const logEntry = `### ${timestamp}\n**Michio**: I have added *${fileName}* to the *${topic}* collection.\n`;
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
                    const parsed = parseLogToMessages(content);
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
        const logEntry = `### ${timestamp}\n**User**: ${userMsg}\n`;
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
        // We use the new getRecentLogs method
        const localHistory = await storage.getRecentLogs(6); 
        const knowledgeContext = await storage.getKnowledgeContext(userMsg);
        
        const fullContext = `${knowledgeContext}\n\n--- Current Conversation History (Last 6h) ---\n${localHistory}`;

        // 3. Call AI (Stateless - just compute)
        const config = await settingsManager.getConfig();
        
        const res = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({ 
                message: userMsg,
                history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })), // Send simplified history
                context: fullContext,
                config
            }), 
            headers: { "Content-Type": "application/json" },
        });
      
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Unknown error");
        
        const responseText = data.response;
        const usageData = data.usage; // { prompt_tokens, completion_tokens, total_tokens }
        const toolCalls = data.tool_calls;

        // Update Session Stats
        if (usageData) {
            setSessionUsage(prev => ({
                input: prev.input + (usageData.prompt_tokens || 0),
                output: prev.output + (usageData.completion_tokens || 0),
                total: prev.total + (usageData.total_tokens || 0)
            }));
        }

        const respTimestamp = new Date().toLocaleTimeString();

        // Handle Tool Calls (e.g. update_file)
        if (toolCalls && toolCalls.length > 0) {
             for (const tool of toolCalls) {
                 if (tool.function.name === 'update_file') {
                     try {
                         const args = JSON.parse(tool.function.arguments);
                         let newContent = args.newContent;

                         // Auto-Summarize for AI Edits too
                         try {
                             const res = await fetch('/api/ai/summarize', {
                                 method: 'POST',
                                 body: JSON.stringify({ content: newContent }),
                                 headers: { 'Content-Type': 'application/json' }
                             });
                             const data = await res.json();
                             if (data.summary) {
                                 newContent = `> **Summary**: ${data.summary}\n\n---\n\n${newContent}`;
                             }
                         } catch (err) {
                             console.error("Tool Summary Failed", err);
                             // Proceed with raw content
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
                        await storage.appendFile(`history/${currentDate}.md`, `**Michio**: ${confirmMsg}\n`);
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
                     try {
                         const res = await fetch('/api/ai/summarize', {
                             method: 'POST',
                             body: JSON.stringify({ content: content }),
                             headers: { 'Content-Type': 'application/json' }
                         });
                         const data = await res.json();
                         if (data.summary) {
                             content = `> **Summary**: ${data.summary}\n\n---\n\n${content}`;
                         }
                     } catch (err) {
                         console.error("Tool Summary Failed", err);
                     }

                     await storage.saveFile(args.filePath, content);
                     
                     const confirmMsg = `I've created *${args.filePath}* with the generated content (and summary).`;
                     
                     setMessages(prev => [...prev, { 
                        role: 'michio', 
                        content: confirmMsg, 
                        timestamp: respTimestamp,
                        usage: usageData ? { total_tokens: usageData.completion_tokens } : undefined
                    }]);

                    await storage.appendFile(`history/${currentDate}.md`, `**Michio**: ${confirmMsg}\n`);
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
                    await storage.appendFile(`history/${currentDate}.md`, `**Michio**: ${updateMsg}\n`);

                } catch (e: any) {
                     console.error("Tool Settings Error", e);
                }
             }
             }
             // For now, we stop here. In a real agent loop, we'd feed the result back to AI.
             // But for "Edit this file", a confirmation is enough.
        } else {
             // Normal Text Response
             setMessages(prev => [...prev, { 
                role: 'michio', 
                content: responseText, 
                timestamp: respTimestamp,
                usage: usageData ? { total_tokens: usageData.completion_tokens } : undefined
            }]);
            
            // 4. Save Michio Response Locally
            const michioEntry = `**Michio**: ${responseText}\n`;
            await storage.appendFile(`history/${currentDate}.md`, michioEntry);
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
      
      const userMatch = body.match(/\*\*User\*\*: ([\s\S]*?)(?=\n\*\*Michio\*\*|$)/);
      const michioMatch = body.match(/\*\*Michio\*\*: ([\s\S]*)/);
      
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
             <button 
                onClick={() => setIsSourceModalOpen(true)}
                style={{
                    fontSize: '1.2rem', 
                    background: '#f3f4f6', 
                    border: 'none', 
                    borderRadius: '50%', 
                    width: 32, height: 32, 
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title="Add Source"
             >
                +
             </button>
             
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
        </div>
        
        <div className={styles.authBadge}>
             {session ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    {/* Session Usage Counter */}
                    <div style={{ fontSize: '0.75rem', color: '#666', border: '1px solid #ddd', padding: '2px 6px', borderRadius: 4 }}>
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
                        <h1>Michio</h1>
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
                             <strong>{msg.role === 'michio' ? 'Michio' : 'You'}</strong>
                             <span>{msg.timestamp}</span>
                        </div>
                        
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        
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
                    <div className={styles.michioMessage} style={{ fontStyle: 'italic', opacity: 0.5 }}>
                        Thinking...
                    </div>
                )}
             </div>
      </div>

      {/* 3. Fixed Input Area */}
      <div className={styles.inputArea}>
        <form onSubmit={handleChat} className={styles.inputWrapper}>
            <textarea 
                ref={textareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChat(e as any);
                  }
                }}
                placeholder="Message Michio..."
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
        </form>
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
        <FileExplorer storage={storage} onClose={() => setIsExplorerOpen(false)} syncLogs={syncLogs} onOpenFile={handleOpenFile} />
      )}

      {viewingSource && (
        <SourceViewer 
            title={viewingSource.title} 
            content={viewingSource.content} 
            onClose={() => setViewingSource(null)} 
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
