import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from '../page.module.css';

// Tiptap Imports
import { useEditor, EditorContent, Extension, ReactNodeViewRenderer, SingleCommands } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Placeholder from '@tiptap/extension-placeholder';
import LinkExtension from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Extension as CoreExtension, getMarkRange } from '@tiptap/core'; // Use core for Extension base
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { 
    Bold, Italic, Strikethrough, Code, Link as LinkIcon, 
    Highlighter, MessageSquareText, ChevronDown, FolderOpen, Edit3, Trash2, Save, X,
    Type, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus
} from 'lucide-react'; // Notion-style Icons

interface SourceEditorProps {
    file: {
        path: string;
        content: string;
        tags?: string[];
        metadata?: any;
    };
    onSave: (content: string, tags: string[], metadata: any) => Promise<void>;
    onUpdateMetadata?: (tags: string[], metadata: any) => Promise<void>;
    onClose: () => void;
}

import Highlight from '@tiptap/extension-highlight';
import { Slice, Fragment, Node } from '@tiptap/pm/model'; // Import Slice for transformCopied

interface Comment {
    id: string;
    text: string;
    quote: string;
    timestamp: number;
}

const CommentIconExtension = Extension.create({
    name: 'commentIcon',
    addProseMirrorPlugins() {
        return [
            new Plugin({
                props: {
                    decorations(state) {
                        const { doc } = state;
                        const decorations: Decoration[] = [];
                        doc.descendants((node, pos) => {
                            if (!node.isText) return;
                            const hasComment = node.marks.find(m => m.type.name === 'highlight' && m.attrs.commentId);
                            if (hasComment) {
                                // Add icon at the end of the text node? Or floating?
                                // User wants "next to the paragraph".
                                // Adding a widget at the end of the text node is safest.
                                const widget = Decoration.widget(pos + node.nodeSize, () => {
                                    const span = document.createElement('span');
                                    span.className = 'comment-icon-widget';
                                    span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg>';
                                    span.title = 'Has comment';
                                    return span;
                                }, { side: 1 });
                                decorations.push(widget);
                            }
                        });
                        return DecorationSet.create(doc, decorations);
                    }
                }
            })
        ]
    }
});

export default function SourceEditor({ file, onSave, onUpdateMetadata, onClose }: SourceEditorProps) {
    // State
    // Robust detection: Metadata OR extension
    const [isSource, setIsSource] = useState(file.metadata?.isSource || file.path.endsWith('.source.md')); 
    const [isEditing, setIsEditing] = useState(false);
    const [tags, setTags] = useState<string[]>(file.tags || []);
    const [tagInput, setTagInput] = useState("");
    const [editedContent, setEditedContent] = useState(file.content);
    const [comments, setComments] = useState<Comment[]>(file.metadata?.comments || []);
    
    // Sync comments with props (critical for persistence across reloads/saves)
    useEffect(() => {
        if (file.metadata?.comments) {
             setComments(file.metadata.comments);
        }
    }, [file.metadata?.comments]);

    // Derived State
    const canEdit = !isSource || isEditing; 

    // Ref to access editor inside handlers defined before useEditor (Circular Dependency Fix)
    const editorRef = useRef<any>(null);

    // --- SLASH COMMAND STATE & HANDLERS ---
    const [slashMenuPos, setSlashMenuPos] = useState<{top: number, left: number} | null>(null);
    const [slashQuery, setSlashQuery] = useState("");
    const [slashIndex, setSlashIndex] = useState(0);

    const SLASH_COMMANDS = [
        { label: 'Text', icon: <Type size={16} />, action: (chain: any) => chain.setParagraph(), style: {} },
        { label: 'Heading 1', icon: <Heading1 size={16} />, action: (chain: any) => chain.toggleHeading({ level: 1 }), style: { fontSize: '1.2em', fontWeight: 700 } },
        { label: 'Heading 2', icon: <Heading2 size={16} />, action: (chain: any) => chain.toggleHeading({ level: 2 }), style: { fontSize: '1.1em', fontWeight: 600 } },
        { label: 'Heading 3', icon: <Heading3 size={16} />, action: (chain: any) => chain.toggleHeading({ level: 3 }), style: { fontSize: '1em', fontWeight: 600 } },
        { label: 'Bullet List', icon: <List size={16} />, action: (chain: any) => chain.toggleBulletList(), style: {} },
        { label: 'Numbered List', icon: <ListOrdered size={16} />, action: (chain: any) => chain.toggleOrderedList(), style: {} },
        { label: 'Quote', icon: <Quote size={16} />, action: (chain: any) => chain.toggleBlockquote(), style: {} },
        { label: 'Divider', icon: <Minus size={16} />, action: (chain: any) => chain.setHorizontalRule(), style: {} },
        { label: 'Code Block', icon: <Code size={16} />, action: (chain: any) => chain.toggleCodeBlock(), style: { fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: 4 } },
    ];

    const filteredSlashCommands = SLASH_COMMANDS.filter(cmd => 
        cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
    );

    const executeSlashCommand = (cmd: any) => {
        const editor = editorRef.current;
        if (!editor) return;
        
        const { from } = editor.state.selection;
        const $pos = editor.state.doc.resolve(from);
        
        // Re-calculate the slash toggle range to be safe
        // Look back 50 chars for the slash
        const textBefore = $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 50), $pos.parentOffset, '\0', '\0');
        const match = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9]*)$/);
        
        let startPos = from - 1; // Default to just previous char
        if (match) {
            // match[1] is the query (e.g. "h1")
            // match[0] is " /h1" or "/h1". 
            // We want to delete the "/" and the query.
            startPos = from - match[1].length - 1;
        }

        // Execute as a single transaction to prevent history fragmentation
        // and ensure the UI updates cleanly.
        editor.chain()
            .focus()
            .deleteRange({ from: startPos, to: from })
            .run();
            
        // Run the command action
        // We pass the chain from the fresh editor state
        // Note: cmd.action expects a chain, transforms it, but does NOT run it.
        // We need to run it.
        const chain = cmd.action(editor.chain().focus());
        chain.run();
        
        setSlashMenuPos(null);
        setSlashQuery("");
        setSlashIndex(0);
    };

    // KEYBOARD NAVIGATION FOR SLASH MENU
    const handleKeyDown = (view: any, event: KeyboardEvent) => {
        if (!slashMenuPos) return false;

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSlashIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
            return true;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
            return true;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (filteredSlashCommands[slashIndex]) {
                 executeSlashCommand(filteredSlashCommands[slashIndex]);
            }
            return true;
        }
        if (event.key === 'Escape') {
            setSlashMenuPos(null);
            return true;
        }
        return false;
    };


    // Tiptap Editor
    const editor = useEditor({
        onCreate: ({ editor }) => {
            editorRef.current = editor;
        },
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                // Configure Heading to be nice
                heading: {
                    levels: [1, 2, 3]
                }
            }),
            Markdown.configure({
                html: true,
                breaks: true, // Use <br> for hard breaks
            }),
            CommentIconExtension,
            Highlight.configure({ multicolor: true }).extend({
                addAttributes() {
                    return {
                        commentId: {
                            default: null,
                            parseHTML: element => element.getAttribute('data-comment-id'),
                            renderHTML: attributes => {
                                return {
                                    'data-comment-id': attributes.commentId,
                                }
                            },
                        }
                    }
                }
            }),
            LinkExtension.configure({ openOnClick: false }),
            Placeholder.configure({ placeholder: "Start typing..." }),
            TextStyle,
            Color
        ],
        content: file.content,
        onUpdate: ({ editor }) => {
            // Get Markdown content
            const markdown = (editor.storage as any).markdown.getMarkdown();
            setEditedContent(markdown);
        },
        editable: isEditing,
        // Ensure click events work for comments
        editorProps: {
            handleClick: (view, pos, event) => {
                 // Return false to allow default behavior
                 return false;
            },
            // Prevent copying comment highlights
            // Prevent copying comment highlights (Recursive)
            transformCopied: (slice: Slice, view) => {
                const removeHighlight = (fragment: Fragment): Fragment => {
                    const newNodes: Node[] = [];
                    fragment.forEach((node) => {
                        if (node.isText) {
                            newNodes.push(node.mark(node.marks.filter(m => m.type.name !== 'highlight')));
                        } else {
                            // Recursively clean children
                            const newContent = removeHighlight(node.content);
                            newNodes.push(node.copy(newContent));
                        }
                    });
                    return Fragment.fromArray(newNodes);
                };

                return new Slice(removeHighlight(slice.content), slice.openStart, slice.openEnd);
            },
            // Handle Keydown for Slash Menu Nav
            handleKeyDown: (view, event) => {
                return handleKeyDown(view, event);
            }
        }
    });

    // Update Editable State of Editor
    useEffect(() => {
        editor?.setEditable(isEditing);
    }, [isEditing, editor]);

    // Popup States (Manual positioning to avoid BubbleMenu Read-Only limitations)
    // Popup States (Manual positioning to avoid BubbleMenu Read-Only limitations)
    const [selectionMenuPos, setSelectionMenuPos] = useState<{top: number, left: number} | null>(null);
    const [editMenuPos, setEditMenuPos] = useState<{top: number, left: number} | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [commentPopupPos, setCommentPopupPos] = useState<{top: number, left: number} | null>(null);
    
    // Editing Comment State
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState("");
    
    // Ref for updatePopups to access latest state without re-binding
    const editingCommentIdRef = useRef<string | null>(null);
    useEffect(() => { editingCommentIdRef.current = editingCommentId; }, [editingCommentId]);
    
    // Bubble Menu UI State
    const [activeDropdown, setActiveDropdown] = useState<'turnInto' | 'color' | null>(null);



    // Track Selection & Highlights - MOVED HERE (After editor decl)
    useEffect(() => {
        if (!editor) return;

        const updatePopups = () => {
            if (editor.isDestroyed) return;

            // Safe interaction with view
            const { selection } = editor.state;
            const view = editor.view;

            // 1. Selection Menus (Read & Edit)
            if (!selection.empty && !editor.isActive('highlight')) {
                const { to } = selection;
                const coords = view.coordsAtPos(to);
                
                // Adjust position to be above the selection
                const pos = { top: coords.top - 50, left: coords.left };

                if (isEditing) {
                    // Show Edit Toolbar
                    setEditMenuPos(pos);
                    setSelectionMenuPos(null);
                } else {
                    // Show Read Menu ("Add Comment")
                    setSelectionMenuPos(pos);
                    setEditMenuPos(null);
                }
            } else {
                setSelectionMenuPos(null);
                // Do NOT hide Edit Toolbar automatically if we are interacting with it?
                // Tiptap's BubbleMenu logic checks for focus.
                // For now, if selection is empty, we must hide it.
                // But if we click the menu, selection might stay?
                // Actually, if selection remains range, we show it. 
                if (selection.empty) {
                    setEditMenuPos(null);
                }
            }

            // --- SLASH COMMAND DETECTION ---
            if (isEditing && selection.empty) {
                const { from } = selection;
                const $pos = editor.state.doc.resolve(from);
                const textBefore = $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 20), $pos.parentOffset, '\0', '\0');
                
                // Matches "/" at start of line OR " /"
                const match = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9]*)$/);
                
                if (match) {
                    const query = match[1];
                    setSlashQuery(query);
                    const coords = view.coordsAtPos(from);
                    setSlashMenuPos({ top: coords.bottom + 5, left: coords.left });
                } else {
                    setSlashMenuPos(null);
                }
            } else {
                setSlashMenuPos(null);
            }

            // 2. View Comment Popup
            // Show ONLY if selection IS EMPTY (cursor inside) AND highlight is active.
            // If selection is range, we show Formatting Menu (Edit) or nothing (Read).
            // 2. View Comment Popup
            // Show IF:
            // a) Selection is empty AND highlight active (Viewing)
            // b) We are currently EDITING a comment (regardless of selection)
            if (editingCommentIdRef.current) {
                // Keep it open!
            } else if (selection.empty && editor.isActive('highlight')) {
                const attrs = editor.getAttributes('highlight');
                if (attrs.commentId) {
                    // Only update if ID changed to avoid jitter, or if we need to show it initially
                    if (activeCommentId !== attrs.commentId) {
                        setActiveCommentId(attrs.commentId);
                        
                        // Find the range of this mark
                        const { from } = editor.state.selection;
                        const resolvedPos = editor.state.doc.resolve(from);
                        const markRange = getMarkRange(resolvedPos, editor.schema.marks.highlight);
                        
                        if (markRange) {
                            const coords = view.coordsAtPos(markRange.from); 
                            setCommentPopupPos({ top: coords.bottom, left: coords.left });
                        } else {
                            // Fallback to cursor if range fails (shouldn't happen if isActive is true)
                            const coords = view.coordsAtPos(from);
                            setCommentPopupPos({ top: coords.bottom, left: coords.left });
                        }
                    }
                }
            } else {
                // HIDE condition:
                // Only hide if we aren't currently editing this comment
                if (!editingCommentIdRef.current) {
                     setActiveCommentId(null);
                     setCommentPopupPos(null);
                }
            }
        };

        editor.on('selectionUpdate', updatePopups);
        editor.on('transaction', updatePopups);
        
        return () => {
            editor.off('selectionUpdate', updatePopups);
            editor.off('transaction', updatePopups);
        };
    }, [editor, isEditing]);

    // Handlers
    const handleSave = async () => {
        // Construct basic metadata
        const newMeta = { ...file.metadata, isSource, comments: file.metadata?.comments || [] };
        
        await onSave(editedContent, tags, newMeta);
        setIsEditing(false);
    };

    const handleAddComment = async () => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return; // No selection
        
        // Ensure we can write to editor even if in Read mode
        const wasEditable = editor.isEditable;
        if (!wasEditable) editor.setEditable(true);

        const quote = editor.state.doc.textBetween(from, to, ' ');
        const commentId = crypto.randomUUID();
        
        // --- CRITICAL FIX: Set Ref IMMEDIATELY before transaction ---
        // This prevents updatePopups (triggered by setMark) from closing the popup
        // because it thinks we aren't editing yet.
        editingCommentIdRef.current = commentId;

        // Add highlight with commentId
        editor.chain().focus().setMark('highlight', { commentId }).run();
        
        if (!wasEditable) editor.setEditable(false);
        if (!wasEditable) editor.setEditable(false);
        setSelectionMenuPos(null); // Hide menu after adding
        setEditMenuPos(null); // Hide edit menu too

        const newComment: Comment = {
            id: commentId,
            text: "", // Empty initially
            quote,
            timestamp: Date.now()
        };
        
        // Use PROP as source of truth to avoid stale state
        const currentComments = file.metadata?.comments || [];
        const newComments = [...currentComments, newComment];
        
        setComments(newComments);
        
        // Auto-save metadata
        if (onUpdateMetadata) {
             const newMeta = { ...file.metadata, isSource, comments: newComments };
             await onUpdateMetadata(tags, newMeta);
        }

        // --- NEW: Immediately open popup in Edit Mode ---
        // 1. Set IDs
        setActiveCommentId(commentId);
        setEditingCommentId(commentId);
        setEditingCommentText(""); // Fresh start

        // 2. Calculate Position IMMEDIATELY (Don't wait for effect)
        // We use the start of the selection (or the mark range)
        const view = editor.view;
        // Selection is still active (range). We want the popup near the start or end?
        // Usually near the end of selection or the side.
        // Let's use 'to' (end of selection) or 'from'.
        // Meechi style: coordsAtPos(from)
        const coords = view.coordsAtPos(from);
        setCommentPopupPos({ top: coords.bottom, left: coords.left });
        
    };

    const handleDeleteComment = async (id: string) => {
        if (!editor) return;
        
        // 1. Remove Mark
        const wasEditable = editor.isEditable;
        if (!wasEditable) editor.setEditable(true);
        
        editor.state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find(m => m.type.name === 'highlight' && m.attrs.commentId === id);
            if (mark) {
                // Remove mark from the range
                const tr = editor.state.tr.removeMark(pos, pos + node.nodeSize, mark.type);
                editor.view.dispatch(tr);
            }
        });

        if (!wasEditable) editor.setEditable(false);

        // 2. Remove from Metadata
        const currentComments = file.metadata?.comments || [];
        const newComments = currentComments.filter((c: Comment) => c.id !== id);
        
        setComments(newComments);
        if (onUpdateMetadata) {
             const newMeta = { ...file.metadata, isSource, comments: newComments };
             await onUpdateMetadata(tags, newMeta);
        }
        
        // Reset state
        setEditingCommentId(null);
        setActiveCommentId(null);
    };

    const handleStartEditComment = (comment: Comment) => {
        setEditingCommentId(comment.id);
        setEditingCommentText(comment.text);
    };

    const handleSaveCommentEdit = async () => {
        if (!editingCommentId) return;

        const currentComments = file.metadata?.comments || [];
        const newComments = currentComments.map((c: Comment) => 
            c.id === editingCommentId ? { ...c, text: editingCommentText } : c
        );

        setComments(newComments);
        if (onUpdateMetadata) {
             const newMeta = { ...file.metadata, isSource, comments: newComments };
             await onUpdateMetadata(tags, newMeta);
        }
        
        setEditingCommentId(null);
    };

    const handleAddTag = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            if (!tags.includes(tagInput.trim())) {
                const newTags = [...tags, tagInput.trim()];
                setTags(newTags);
                if (onUpdateMetadata) {
                    await onUpdateMetadata(newTags, { ...file.metadata, isSource, comments });
                }
            }
            setTagInput("");
        }
    };

    const removeTag = async (t: string) => {
        const newTags = tags.filter(tag => tag !== t);
        setTags(newTags);
        if (onUpdateMetadata) {
            await onUpdateMetadata(newTags, { ...file.metadata, isSource, comments });
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()} 
                 style={{ 
                     width: '85%', maxWidth: 900, height: '85vh', 
                     display: 'flex', flexDirection: 'column',
                     background: 'var(--surface)', color: 'var(--foreground)'
                 }}>
                
                {/* Header Toolbar */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '1rem', borderBottom: '1px solid var(--border)' 
                }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>
                            {file.path.split('/').pop()}
                        </h2>
                        <span style={{ 
                             fontSize: '0.75rem', 
                             padding: '2px 6px', borderRadius: 4,
                             background: isSource ? '#dbeafe' : '#fef3c7',
                             color: isSource ? '#1e40af' : '#92400e',
                             border: '1px solid currentColor'
                        }}>
                            {isSource ? 'SOURCE' : 'NOTE'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                         {/* Primary Actions: Only Edit/Save for Notes */}
                         {!isSource && !isEditing && (
                            <button onClick={() => setIsEditing(true)} className={styles.secondaryButton} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Edit3 size={16} /> Edit
                            </button>
                         )}
                         
                         {isEditing && (
                             <button onClick={handleSave} className={styles.primaryButton} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                 <Save size={16} /> Save
                             </button>
                         )}

                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem', display: 'flex', alignItems: 'center' }}>
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Sub-Header: Tags & Metadata (Allow editing even for sources) */}
                <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Tags:</span>
                    {tags.map(t => (
                        <span key={t} style={{ 
                            fontSize: '0.75rem', background: 'var(--surface-2)', 
                            padding: '2px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4
                        }}>
                            {t}
                            <span onClick={() => removeTag(t)} style={{ cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center' }}><X size={12} /></span>
                        </span>
                    ))}
                    <input 
                        type="text" 
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        placeholder="+ Add Tag"
                        style={{ 
                            background: 'transparent', border: 'none', 
                            fontSize: '0.75rem', outline: 'none', minWidth: 60
                        }}
                    />
                </div>

                {/* Editor Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    {/* Tiptap Editor */}
                     {editor && (
                        <>
                            {/* Edit Mode Formatting Menu - Allow on Highlights too */}
                            {/* Edit Mode Formatting Menu - Notion Style */}
                            {/* Edit Mode Formatting Menu - Notion Style (Manual Position) */}
                            {isEditing && editMenuPos && (
                                <div className={styles.bubbleMenuNotion} style={{
                                    position: 'fixed',
                                    top: editMenuPos.top,
                                    left: editMenuPos.left,
                                    zIndex: 10000,
                                    background: 'var(--surface)'
                                }}>
                                    {/* Dropdown Placeholder (Turn Into) */}
                                    <div className={styles.bubbleDropdown} onClick={() => setActiveDropdown(activeDropdown === 'turnInto' ? null : 'turnInto')} style={{position:'relative'}}>
                                        <span>Turn into</span> <ChevronDown size={14} />
                                        
                                        {activeDropdown === 'turnInto' && (
                                            <div className={styles.dropdownMenu} onClick={e => e.stopPropagation()}>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().setParagraph().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Type size={14} /> Text
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleHeading({level:1}).run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Heading1 size={14} /> Heading 1
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleHeading({level:2}).run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Heading2 size={14} /> Heading 2
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleHeading({level:3}).run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Heading3 size={14} /> Heading 3
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleBulletList().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <List size={14} /> Bullet List
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleOrderedList().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <ListOrdered size={14} /> Numbered List
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleBlockquote().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Quote size={14} /> Quote
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleCodeBlock().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Code size={14} /> Code Block
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                        
                                        <div className={styles.bubbleDivider} />

                                        <button 
                                            onClick={() => editor.chain().focus().toggleBold().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('bold') ? styles.bubbleBtnActive : ''}`}
                                            title="Bold (Cmd+B)"
                                        >
                                            <Bold size={16} />
                                        </button>
                                        <button 
                                            onClick={() => editor.chain().focus().toggleItalic().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('italic') ? styles.bubbleBtnActive : ''}`}
                                            title="Italic (Cmd+I)"
                                        >
                                            <Italic size={16} />
                                        </button>
                                        <button 
                                            onClick={() => editor.chain().focus().toggleStrike().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('strike') ? styles.bubbleBtnActive : ''}`}
                                            title="Strikethrough (Cmd+Shift+S)"
                                        >
                                            <Strikethrough size={16} />
                                        </button>
                                        <button 
                                            onClick={() => editor.chain().focus().toggleCode().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('code') ? styles.bubbleBtnActive : ''}`}
                                            title="Code (Cmd+E)"
                                        >
                                            <Code size={16} />
                                        </button>

                                        <div className={styles.bubbleDivider} />

                                        <button 
                                            onClick={() => {
                                                const url = window.prompt('URL');
                                                if (url) editor.chain().focus().setLink({ href: url }).run();
                                            }} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('link') ? styles.bubbleBtnActive : ''}`}
                                            title="Link"
                                        >
                                            <LinkIcon size={16} />
                                        </button>
                                        
                                        {/* Color Picker Placeholder */}
                                        <button className={styles.bubbleBtn} title="Text Color" onClick={() => setActiveDropdown(activeDropdown === 'color' ? null : 'color')} style={{position:'relative'}}>
                                            <span style={{ fontSize: 14, fontWeight: 'bold' }}>A</span>
                                            {activeDropdown === 'color' && (
                                                <div className={styles.dropdownMenu} style={{ flexDirection: 'row', flexWrap: 'wrap', width: 140, padding: 8, gap: 4 }} onClick={e => e.stopPropagation()}>
                                                    {/* Standard Text Colors */}
                                                    <div className={styles.colorOption} style={{background:'#000'}} onClick={() => { editor.chain().focus().unsetColor().run(); setActiveDropdown(null); }} title="Default" />
                                                    <div className={styles.colorOption} style={{background:'#6b7280'}} onClick={() => { editor.chain().focus().setColor('#6b7280').run(); setActiveDropdown(null); }} title="Gray" />
                                                    <div className={styles.colorOption} style={{background:'#92400e'}} onClick={() => { editor.chain().focus().setColor('#92400e').run(); setActiveDropdown(null); }} title="Brown" />
                                                    <div className={styles.colorOption} style={{background:'#d97706'}} onClick={() => { editor.chain().focus().setColor('#d97706').run(); setActiveDropdown(null); }} title="Orange" />
                                                    <div className={styles.colorOption} style={{background:'#eab308'}} onClick={() => { editor.chain().focus().setColor('#eab308').run(); setActiveDropdown(null); }} title="Yellow" />
                                                    <div className={styles.colorOption} style={{background:'#16a34a'}} onClick={() => { editor.chain().focus().setColor('#16a34a').run(); setActiveDropdown(null); }} title="Green" />
                                                    <div className={styles.colorOption} style={{background:'#2563eb'}} onClick={() => { editor.chain().focus().setColor('#2563eb').run(); setActiveDropdown(null); }} title="Blue" />
                                                    <div className={styles.colorOption} style={{background:'#9333ea'}} onClick={() => { editor.chain().focus().setColor('#9333ea').run(); setActiveDropdown(null); }} title="Purple" />
                                                    <div className={styles.colorOption} style={{background:'#db2777'}} onClick={() => { editor.chain().focus().setColor('#db2777').run(); setActiveDropdown(null); }} title="Pink" />
                                                    <div className={styles.colorOption} style={{background:'#dc2626'}} onClick={() => { editor.chain().focus().setColor('#dc2626').run(); setActiveDropdown(null); }} title="Red" />
                                                </div>
                                            )}
                                        </button>

                                        <div className={styles.bubbleDivider} />

                                        <button 
                                            onClick={handleAddComment} 
                                            className={styles.bubbleBtn}
                                            title="Add Comment"
                                        >
                                            <MessageSquareText size={16} />
                                        </button>
                                    </div>
                            )}

                             {/* Slash Menu */}
                             {slashMenuPos && filteredSlashCommands.length > 0 && (
                                 <div className={styles.slashMenu} style={{
                                     top: slashMenuPos.top,
                                     left: slashMenuPos.left
                                 }}>
                                     <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                                         Basic Blocks
                                     </div>
                                     {filteredSlashCommands.map((cmd, i) => (
                                         <div 
                                             key={cmd.label}
                                             className={`${styles.slashItem} ${i === slashIndex ? styles.slashItemActive : ''}`}
                                             onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); executeSlashCommand(cmd); }}
                                             onClick={(e) => { e.preventDefault(); e.stopPropagation(); executeSlashCommand(cmd); }}
                                             onMouseEnter={() => setSlashIndex(i)}
                                             style={cmd.style}
                                         >
                                             <div className={styles.slashIcon}>{cmd.icon}</div>
                                             <span>{cmd.label}</span>
                                         </div>
                                     ))}
                                 </div>
                             )}

                            {/* Read Mode Selection Menu (Manually Positioned) */}
                            {selectionMenuPos && (
                                <div className={styles.floatingMenu} style={{
                                    position: 'fixed', top: selectionMenuPos.top, left: selectionMenuPos.left, zIndex: 10000
                                }}>
                                    <button onClick={handleAddComment} title="Add Comment" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <MessageSquareText size={14} /> Add Comment
                                    </button>
                                </div>
                            )}

                             {/* Comment Bubble (Manually Positioned) */}
                             {activeCommentId && commentPopupPos && (() => {
                                 const comment = comments.find(c => c.id === activeCommentId);
                                 if (!comment) return null;
                                 
                                 const isEditingThis = editingCommentId === comment.id;

                                 return (
                                     <div className={styles.commentPopup} style={{
                                         position: 'fixed',
                                         top: commentPopupPos.top + 10,
                                         left: commentPopupPos.left,
                                         zIndex: 10000,
                                         backgroundColor: '#ffffff',
                                         minWidth: 260
                                     }}>
                                         {isEditingThis ? (
                                             // Edit Mode (Clean Input)
                                             <div style={{ padding: '12px' }}>
                                                 <textarea 
                                                     value={editingCommentText}
                                                     onChange={e => setEditingCommentText(e.target.value)}
                                                     style={{ 
                                                         width: '100%', minHeight: 80, padding: 8, 
                                                         border: '1px solid var(--accent)', borderRadius: 6,
                                                         fontSize: '0.95rem', fontFamily: 'inherit',
                                                         outline: 'none', resize: 'vertical',
                                                         background: 'var(--surface)'
                                                     }}
                                                     autoFocus
                                                 />
                                                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                                     <button 
                                                         onClick={() => setEditingCommentId(null)}
                                                         style={{ fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 4 }}
                                                     >
                                                         Cancel
                                                     </button>
                                                     <button 
                                                         onClick={handleSaveCommentEdit}
                                                         style={{ fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer', background: 'var(--foreground)', color: 'var(--surface)', border: 'none', borderRadius: 4, fontWeight: 500 }}
                                                     >
                                                         Save
                                                     </button>
                                                 </div>
                                             </div>
                                         ) : (
                                             // View Mode (Notion/Meechi Style - Simplified)
                                             <>
                                                 <div className={styles.commentHeader}>
                                                     <span className={styles.commentMeta}>
                                                         {new Date(comment.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                     </span>
                                                 </div>
                                                 
                                                 <div className={styles.commentBody}>
                                                     {comment.text}
                                                 </div>

                                                 <div className={styles.commentActions}>
                                                     <button 
                                                         className={styles.commentActionBtn}
                                                         onClick={() => handleStartEditComment(comment)}
                                                         title="Edit Comment"
                                                     >
                                                         {/* Pencil Icon */}
                                                         <Edit3 size={14} />
                                                     </button>
                                                     <button 
                                                         className={styles.commentActionBtn}
                                                         onClick={() => handleDeleteComment(comment.id)}
                                                         title="Delete Comment"
                                                         style={{ color: '#ef4444' }} // Red for delete
                                                     >
                                                         {/* Trash Icon */}
                                                         <Trash2 size={14} />
                                                     </button>
                                                 </div>
                                             </>
                                         )}
                                     </div>
                                 );
                             })()}

                             {/* Main Content */}
                             <div className={isEditing ? styles.editorEditable : styles.editorReadonly}>
                                <EditorContent editor={editor} />
                             </div>
                        </>
                    )}
                </div>
            </div>

            {/* Inline Styles for Tiptap (Scoped) */}
            <style jsx global>{`
                /* Tiptap Styles */
                .ProseMirror {
                    outline: none;
                }
                .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: #adb5bd;
                    pointer-events: none;
                    height: 0;
                }
                
                /* Bubble Menu */
                .${styles.bubbleMenu} {
                    display: flex;
                    background: #333;
                    border-radius: 6px;
                    padding: 0.2rem;
                }
                .${styles.bubbleMenu} button {
                    background: none;
                    color: white;
                    border: none;
                    padding: 0.3rem 0.6rem;
                    cursor: pointer;
                    font-size: 0.8rem;
                }
                .${styles.bubbleMenu} button:hover, .${styles.bubbleMenu} button.is-active {
                    background: #555;
                    border-radius: 4px;
                }
                
                /* Comment Icon Widget */
                .comment-icon-widget {
                    margin-left: 4px;
                    font-size: 0.8rem;
                    cursor: default;
                    opacity: 0.7;
                    float: right; /* Try to float it? Use with caution */
                }

                /* Floating Menu */


                /* Floating Menu */
                .${styles.floatingMenu} {
                    display: flex;
                    gap: 0.5rem;
                    background: var(--surface);
                    border: 1px solid var(--border);
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    border-radius: 6px;
                    border-radius: 6px;
                    padding: 0.3rem;
                    /* Ensure it handles events */
                    pointer-events: auto; 
                }
                .${styles.floatingMenu} button {
                    background: none;
                    border: 1px solid transparent;
                    padding: 2px 6px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    border-radius: 4px;
                }
                .${styles.floatingMenu} button:hover {
                    background: rgba(0,0,0,0.05);
                }
            `}</style>
        </div>
    );
}
