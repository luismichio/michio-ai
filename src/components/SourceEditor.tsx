import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from '@/app/app/page.module.css';

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
import Icon from '@/components/Icon';


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

// CommentIconExtension removed in favor of coordinate-based sidebar icons


export default function SourceEditor({ file, onSave, onUpdateMetadata, onClose }: SourceEditorProps) {
    // State
    // Robust detection: Metadata OR extension
    const [isSource, setIsSource] = useState(file.metadata?.isSource || file.path.endsWith('.source.md')); 
    const [isEditing, setIsEditing] = useState(false);
    const [tags, setTags] = useState<string[]>(file.tags || []);
    const [tagInput, setTagInput] = useState("");
    const [editedContent, setEditedContent] = useState(file.content);
    const [comments, setComments] = useState<Comment[]>(file.metadata?.comments || []);
    const commentsRef = useRef<Comment[]>(comments);
    
    const [sidebarIcons, setSidebarIcons] = useState<{top: number, left: number, count: number, firstCommentId: string}[]>([]);
    
    // Link Modal State
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkText, setLinkText] = useState("");
    const [linkRange, setLinkRange] = useState<{ from: number, to: number } | null>(null);
    
    // Keep ref synced for closures (like updatePopups)
    useEffect(() => {
        commentsRef.current = comments;
    }, [comments]);
    
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
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    // --- SLASH COMMAND STATE & HANDLERS ---

    const [slashMenuPos, setSlashMenuPos] = useState<{top: number, left: number} | null>(null);
    const [slashQuery, setSlashQuery] = useState("");
    const [slashIndex, setSlashIndex] = useState(0);

    const SLASH_COMMANDS = [
        { label: 'Text', icon: <Icon name="Type" size={16} />, action: (chain: any) => chain.setParagraph(), style: {} },
        { label: 'Heading 1', icon: <Icon name="Heading1" size={16} />, action: (chain: any) => chain.toggleHeading({ level: 1 }), style: { fontSize: '1.2em', fontWeight: 700 } },
        { label: 'Heading 2', icon: <Icon name="Heading2" size={16} />, action: (chain: any) => chain.toggleHeading({ level: 2 }), style: { fontSize: '1.1em', fontWeight: 600 } },
        { label: 'Heading 3', icon: <Icon name="Heading3" size={16} />, action: (chain: any) => chain.toggleHeading({ level: 3 }), style: { fontSize: '1em', fontWeight: 600 } },
        { label: 'Bullet List', icon: <Icon name="List" size={16} />, action: (chain: any) => chain.toggleBulletList(), style: {} },
        { label: 'Numbered List', icon: <Icon name="ListOrdered" size={16} />, action: (chain: any) => chain.toggleOrderedList(), style: {} },
        { label: 'Quote', icon: <Icon name="Quote" size={16} />, action: (chain: any) => chain.toggleBlockquote(), style: {} },
        { label: 'Divider', icon: <Icon name="Minus" size={16} />, action: (chain: any) => chain.setHorizontalRule(), style: {} },
        { label: 'Code Block', icon: <Icon name="Code" size={16} />, action: (chain: any) => chain.toggleCodeBlock(), style: { fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: 4 } },
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
                breaks: true,
                transformPastedText: false,
                transformCopiedText: false,
            }),
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
            // LinkExtension.configure({ openOnClick: false }), // Commented out to check for duplicates
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

    // Restore highlights from comment metadata when editor loads
    useEffect(() => {
        if (!editor || comments.length === 0) return;
        
        console.log('[SourceEditor] Checking highlights for', comments.length, 'comments');
        
        // Collect all existing highlights first
        const existingHighlights = new Set<string>();
        editor.state.doc.descendants((node) => {
            if (node.isText) {
                node.marks.forEach(m => {
                    if (m.type.name === 'highlight' && m.attrs.commentId) {
                        existingHighlights.add(m.attrs.commentId);
                    }
                });
            }
        });
        
        // Only restore missing highlights
        const missingComments = comments.filter((c: Comment) => !existingHighlights.has(c.id));
        
        if (missingComments.length === 0) {
            console.log('[SourceEditor] All highlights already present');
            return;
        }
        
        console.log('[SourceEditor] Restoring', missingComments.length, 'missing highlights');
        
        // Wait longer for editor to be fully ready and stable
        setTimeout(() => {
            if (!editor || editor.isDestroyed) return;
            
            const { doc } = editor.state;
            const tr = editor.state.tr;
            let modified = false;
            
            missingComments.forEach((comment: Comment) => {
                // Search for the quoted text
                const quote = comment.quote.trim();
                if (!quote) {
                    console.warn('[SourceEditor] Skipping comment with empty quote:', comment.id.substring(0, 8));
                    return;
                }
                
                let found = false;
                doc.descendants((node, pos) => {
                    if (found || !node.isText) return;
                    
                    const text = node.text || '';
                    const index = text.indexOf(quote);
                    
                    if (index !== -1) {
                        // Found the text, add highlight
                        const from = pos + index;
                        const to = pos + index + quote.length;
                        
                        tr.addMark(from, to, editor.schema.marks.highlight.create({ commentId: comment.id }));
                        modified = true;
                        found = true;
                        console.log('[SourceEditor] ✓ Restored highlight for comment:', comment.id.substring(0, 8), 'at pos', from, '-', to);
                    }
                });
                
                if (!found) {
                    console.warn('[SourceEditor] ✗ Could not find text for comment:', comment.id.substring(0, 8), 'quote:', quote.substring(0, 50));
                }
            });
            
            if (modified) {
                editor.view.dispatch(tr);
                console.log('[SourceEditor] ✓✓✓ Successfully restored', missingComments.length, 'highlights');
            }
        }, 300); // Increased delay to ensure editor is stable
    }, [editor, comments, file.path]); // Added file.path dependency

    // Popup States (Manual positioning to avoid BubbleMenu Read-Only limitations)
    // Popup States (Manual positioning to avoid BubbleMenu Read-Only limitations)
    const [selectionMenuPos, setSelectionMenuPos] = useState<{top: number, left: number} | null>(null);
    const [editMenuPos, setEditMenuPos] = useState<{top: number, left: number} | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [commentPopupPos, setCommentPopupPos] = useState<{top: number, left: number, width?: number} | null>(null);
    
    // Editing Comment State
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState("");
    const [isNewComment, setIsNewComment] = useState(false); // Track if currently editing a new comment
    
    // Ref for updatePopups to access latest state without re-binding
    const editingCommentIdRef = useRef<string | null>(null);
    useEffect(() => { editingCommentIdRef.current = editingCommentId; }, [editingCommentId]);
    
    const activeCommentIdRef = useRef<string | null>(null);
    useEffect(() => { activeCommentIdRef.current = activeCommentId; }, [activeCommentId]);

    // Guards for popup behavior
    const dismissedCommentIdRef = useRef<string | null>(null);
    const lastInteractionRef = useRef<'mouse' | 'keyboard' | null>(null);
    
    // Bubble Menu UI State
    const [activeDropdown, setActiveDropdown] = useState<'turnInto' | 'color' | null>(null);



    // Track Selection & Highlights - MOVED HERE (After editor decl)
    useEffect(() => {
        if (!editor) return;

        const updatePopups = (activeIds?: Set<string>) => {
            if (editor.isDestroyed) return;

            // Safe interaction with view
            const { selection } = editor.state;
            const view = editor.view;

            // 1. Selection Menus (Read & Edit)
            const showMenu = !selection.empty || (editor.isActive('link') && !editor.isActive('highlight'));
            
            if (showMenu) {
                const { from, to } = selection;
                const fromCoords = view.coordsAtPos(from);
                const toCoords = selection.empty ? fromCoords : view.coordsAtPos(to);
                
                // Estimate menu dimensions
                const menuWidth = isEditing ? 350 : 160; 
                const menuHeight = 44;
                
                // Center relative to selection (or cursor if empty)
                let left = (fromCoords.left + toCoords.left) / 2 - (menuWidth / 2);
                let top = fromCoords.top - menuHeight - 12;

                // 1a. Top Boundary - if no space above, show BELOW the selection
                if (top < 10) {
                    top = toCoords.bottom + 12;
                }

                // 1b. Horizontal Boundaries (Viewport)
                const viewportWidth = window.innerWidth;
                if (left + menuWidth > viewportWidth - 15) {
                    left = viewportWidth - menuWidth - 15;
                }
                if (left < 15) {
                    left = 15;
                }

                const pos = { top, left };

                if (isEditing) {
                    // Show Edit Toolbar
                    setEditMenuPos(pos);
                    setSelectionMenuPos(null);
                } else {
                    // Show Read Menu ("Add Comment" + "Link")
                    setSelectionMenuPos(pos);
                    setEditMenuPos(null);
                }
            } else {
                setSelectionMenuPos(null);
                // Do NOT hide Edit Toolbar automatically if we are interacting with it?
                // Tiptap's BubbleMenu logic checks for focus.
                // For now, if selection is empty and NOT a link, we must hide it.
                setEditMenuPos(null);
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
                    
                    // Boundary Checks for Slash Menu
                    const menuWidth = 260;
                    const menuHeight = Math.min(filteredSlashCommands.length * 40 + 40, 300);
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    let top = coords.bottom + 5;
                    let left = coords.left;

                    // Vertical Flip if no space below
                    if (top + menuHeight > viewportHeight - 20) {
                        top = coords.top - menuHeight - 5;
                    }

                    // Horizontal constraint
                    if (left + menuWidth > viewportWidth - 20) {
                        left = viewportWidth - menuWidth - 20;
                    }
                    if (left < 20) left = 20;

                    setSlashMenuPos({ top, left });
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
            } else if (isEditing && lastInteractionRef.current !== 'mouse') {
                // In Edit Mode, we ONLY open if it was a manual click/intentional action
                // Keyboard interactions (arrows/typing) close the viewer
                if (activeCommentId) {
                    setActiveCommentId(null);
                    setCommentPopupPos(null);
                }
            } else if ((selection.empty || lastInteractionRef.current === 'mouse') && editor.isActive('highlight')) {
                const attrs = editor.getAttributes('highlight');
                // Verify this comment ID is actually "alive" in the doc
                const isAlive = activeIds ? activeIds.has(attrs.commentId) : true;
                
                if (attrs.commentId && isAlive) {

                    // Only update if ID changed to avoid jitter, or if we need to show it initially
                    if (activeCommentId !== attrs.commentId) {
                    // Remove active-comment class from all highlights
                    const editorDom = view.dom;
                    editorDom.querySelectorAll('mark[data-comment-id].active-comment').forEach(el => {
                        el.classList.remove('active-comment');
                    });
                    
                    // CHECK DISMISSAL GUARD
                    if (dismissedCommentIdRef.current === attrs.commentId) {
                        return; // Stay dismissed
                    }

                    setActiveCommentId(attrs.commentId);
                    
                    // Clear dismissal guard if we actually changed to a NEW comment
                    if (dismissedCommentIdRef.current) {
                        dismissedCommentIdRef.current = null;
                    }

                    // Find the range of this mark
                        const { from } = editor.state.selection;
                        const resolvedPos = editor.state.doc.resolve(from);
                        const markRange = getMarkRange(resolvedPos, editor.schema.marks.highlight);
                        
                        if (markRange) {
                            const startCoords = view.coordsAtPos(markRange.from);
                            const endCoords = view.coordsAtPos(markRange.to);
                            
                            // Add active-comment class to this highlight
                            setTimeout(() => {
                                const highlightElement = editorDom.querySelector(`mark[data-comment-id="${attrs.commentId}"]`);
                                if (highlightElement) {
                                    highlightElement.classList.add('active-comment');
                                }
                            }, 10);
                            
                            // Get editor bounds
                            const editorDom = view.dom;
                            const editorRect = editorDom.getBoundingClientRect();
                            
                            // Find the comment to check its text length - USE REF to avoid stale closure
                            const comment = commentsRef.current.find(c => c.id === attrs.commentId);
                            const commentTextLength = comment?.text?.length || 0;
                            
                            //Width logic:
                            // - Very short comments (< 50 chars): min 260px, scaled
                            // - Long comments (>= 50 chars): use full editor width
                            let popupWidth;
                            if (commentTextLength >= 50) {
                                // Long comment: use full editor width minus padding
                                popupWidth = editorRect.width - 80; // More padding for aesthetics
                            } else {
                                // Short comment: min 260px, max 500px
                                popupWidth = Math.min(Math.max(260, commentTextLength * 10), 500);
                            }
                            
                            // Get highlight boundaries
                            const highlightTop = startCoords.top;
                            const highlightBottom = endCoords.bottom;
                            const highlightHeight = highlightBottom - highlightTop;
                            
                            // Calculate more accurate popup height based on comment length and width
                            let estimatedPopupHeight;
                            if (commentTextLength === 0) {
                                estimatedPopupHeight = 150; // Empty comment, just input box
                            } else {
                                // Calculate approximate lines needed
                                // Assuming ~70 chars per line at typical width, ~20px per line
                                const charsPerLine = commentTextLength >= 50 ? 90 : 40; // Wider for full-width
                                const lineHeight = 20;
                                const numLines = Math.ceil(commentTextLength / charsPerLine);
                                const textHeight = numLines * lineHeight;
                                
                                // Add padding, header, buttons, borders (150px overhead - increased from 80px)
                                estimatedPopupHeight = textHeight + 150;
                                
                                // Cap at 400px max (will be scrollable beyond this)
                                estimatedPopupHeight = Math.min(estimatedPopupHeight, 400);
                            }
                            
                            console.log('[SourceEditor] Estimated popup height:', estimatedPopupHeight, 'px for', commentTextLength, 'chars');
                            
                            // Minimum spacing to ensure highlight stays visible (increased to 30px)
                            const minSpacing = 30;
                            
                            // Get viewport constraints
                            const viewportHeight = window.innerHeight;
                            const viewportTop = 0;
                            
                            // Calculate available space above and below the highlight
                            const spaceAbove = highlightTop - viewportTop;
                            const spaceBelow = viewportHeight - highlightBottom;
                            
                            console.log('[SourceEditor] Space above:', spaceAbove, 'Space below:', spaceBelow, 'Need:', estimatedPopupHeight);
                            
                            let top;
                            let positionedAbove = false;
                            
                            // Decision logic: prefer below, but switch to above if necessary
                            if (spaceBelow >= estimatedPopupHeight + minSpacing) {
                                // Enough room below - position below the highlight
                                top = highlightBottom + minSpacing;
                                console.log('[SourceEditor] Positioning below highlight');
                                console.log('[SourceEditor] → highlightBottom:', highlightBottom, '+ minSpacing:', minSpacing, '= top:', top);
                            } else if (spaceAbove >= estimatedPopupHeight + minSpacing) {
                                // Not enough below, but enough above - position above
                                top = highlightTop - estimatedPopupHeight - minSpacing;
                                positionedAbove = true;
                                console.log('[SourceEditor] Positioning above highlight (not enough space below)');
                                console.log('[SourceEditor] → highlightTop:', highlightTop, '- height:', estimatedPopupHeight, '- spacing:', minSpacing, '= top:', top);
                            } else {
                                // Not enough space in either direction
                                // Position above and let it extend to top of viewport if needed
                                top = Math.max(10, highlightTop - estimatedPopupHeight - minSpacing);
                                positionedAbove = true;
                                console.warn('[SourceEditor] Limited space - positioning above with possible overflow');
                                console.log('[SourceEditor] → Calculated top:', top);
                            }
                            
                            // Final safety check: ensure popup is within viewport
                            if (top < 10) {
                                top = 10;
                            }
                            if (top + estimatedPopupHeight > viewportHeight - 10) {
                                // If positioned below would overflow, must position above
                                if (!positionedAbove) {
                                    top = highlightTop - estimatedPopupHeight - minSpacing;
                                    console.log('[SourceEditor] Adjusted to above due to viewport overflow');
                                }
                            }
                            
                            // Horizontal positioning
                            let left = startCoords.left;
                            
                            // Ensure popup doesn't overflow right edge
                            if (left + popupWidth > editorRect.right) {
                                left = editorRect.right - popupWidth - 20;
                            }
                            
                            // Ensure popup doesn't overflow left edge
                            if (left < editorRect.left) {
                                left = editorRect.left + 20;
                            }
                            
                            setCommentPopupPos({ top, left, width: popupWidth });
                        } else {
                            // Fallback to cursor if range fails (shouldn't happen if isActive is true)
                            const coords = view.coordsAtPos(from);
                            setCommentPopupPos({ top: coords.bottom, left: coords.left, width: 260 });
                        }
                    }
                }
            } else {
                // setSelectionMenuPos(null); // REMOVED: Conflicting reset
                // IF NOT EDITING A COMMENT, also hide view popups when clicking non-highlighted area
                if (!editingCommentIdRef.current) {
                    if (activeCommentId) {
                        setActiveCommentId(null);
                        setCommentPopupPos(null);
                    }
                    // CLEANUP CLASSES - ensure no ghost highlights
                    const editorDom = view.dom;
                    editorDom.querySelectorAll('mark[data-comment-id].active-comment').forEach(el => {
                        el.classList.remove('active-comment');
                    });
                }
                // Clear dismissal guard if we are no longer on a highlight
                if (dismissedCommentIdRef.current) {
                    dismissedCommentIdRef.current = null;
                }
            }
        };

        const updateSidebarIcons = () => {
            if (!editor || editor.isDestroyed) return new Set<string>();
            const view = editor.view;
            const editorDom = view.dom;
            const editorRect = editorDom.getBoundingClientRect();
            
            const targetLeft = editorRect.left - 30; // Offset to the left of editor
            
            // 1. Group highlights by line
            const lineGroups = new Map<number, { top: number, ids: string[] }>();
            const activeIds = new Set<string>();

            editor.state.doc.descendants((node, pos) => {
                if (!node.isText) return;
                const mark = node.marks.find(m => m.type.name === 'highlight' && m.attrs.commentId);
                if (mark) {
                    const commentId = mark.attrs.commentId;
                    activeIds.add(commentId);
                    
                    const startCoords = view.coordsAtPos(pos);
                    // Use relative top (offset from editor top)
                    const top = startCoords.top - editorRect.top; 
                    
                    // Snap to grid for grouping (using relative top)
                    const gridTop = Math.floor(top / 20) * 20;
                    
                    if (!lineGroups.has(gridTop)) {
                        lineGroups.set(gridTop, { top, ids: [] });
                    }
                    const group = lineGroups.get(gridTop)!;
                    if (!group.ids.includes(commentId)) {
                        group.ids.push(commentId);
                    }
                }
            });

            // 2. Convert to sidebar list
            const sidebarList = Array.from(lineGroups.values()).map(line => ({
                top: line.top,
                left: 0, // Using absolute positioning relative to the sidebar layer (which is at -40px)
                count: line.ids.length,
                firstCommentId: line.ids[0]
            }));

            setSidebarIcons(sidebarList);
            return activeIds;
        };

        const handleUpdate = () => {
            const activeIds = updateSidebarIcons();
            updatePopups(activeIds);
        };

        // Dismissal logic for clicks outside
        const handleGlobalMousedown = (e: MouseEvent) => {
            const currentActive = activeCommentIdRef.current;
            const currentEditing = editingCommentIdRef.current;
            
            const target = e.target as HTMLElement;
            const isOutsideEditor = editorContainerRef.current && !editorContainerRef.current.contains(target);
            const isOutsidePopup = popupRef.current && !popupRef.current.contains(target);
            const clickedHighlight = target.closest('mark[data-comment-id]');
            const clickedCommentId = clickedHighlight?.getAttribute('data-comment-id');

            // 1. If clicking INSIDE the popup, do nothing (allow interaction with buttons/scroll)
            if (!isOutsidePopup) return;

            // If we click INSIDE the editor (even on plain text), clear the dismissal guard
            if (!isOutsideEditor) {
                dismissedCommentIdRef.current = null;
                lastInteractionRef.current = 'mouse';
            }

            // 2. If clicking on a highlight, handle toggle/intentional open
            if (clickedCommentId) {
                lastInteractionRef.current = 'mouse';
                
                if (clickedCommentId === currentActive) {
                    // Clicked same highlight -> Toggle (Close & Deselect)
                    dismissedCommentIdRef.current = clickedCommentId;
                    setActiveCommentId(null);
                    setCommentPopupPos(null);
                    if (editor && !editor.isDestroyed) {
                        // Collapse selection to effectively "deselect"
                        editor.commands.setTextSelection(editor.state.selection.to);
                    }
                    return;
                }
                // Different highlight -> will be handled by auto-open logic
                return;
            }

            // 3. Clicked ANYWHERE else (plain text, margins, background) -> Dismiss & Deselect
            if (currentActive || currentEditing) {
                if (currentActive) {
                    dismissedCommentIdRef.current = currentActive;
                }
                
                // Deselect / Collapse selection to end
                if (editor && !editor.isDestroyed) {
                    const { selection } = editor.state;
                    editor.commands.setTextSelection(selection.to);
                }

                setActiveCommentId(null);
                setCommentPopupPos(null);
                setEditingCommentId(null);
            }
        };

        // Dismissal logic for keyboard - clear guard and DISMISS on any key
        const handleGlobalKeydown = (e: KeyboardEvent) => {
            dismissedCommentIdRef.current = null;
            lastInteractionRef.current = 'keyboard';
            
            const currentActive = activeCommentIdRef.current;
            const currentEditing = editingCommentIdRef.current;
            
            // Ignore if we are actually editing a comment
            if (currentEditing) return;

            // Typing or moving caret closes the viewer
            if (currentActive) {
                setActiveCommentId(null);
                setCommentPopupPos(null);
            }
        };

        // Dismissal logic for scroll
        const handleGlobalScroll = (e: Event) => {
            const currentActive = activeCommentIdRef.current;
            const currentEditing = editingCommentIdRef.current;
            if (!currentActive && !currentEditing) return;
            
            // Check if scroll is happening INSIDE the comment
            // Use (e.target as any) to bypass Prosemirror Node collision
            const isInsideComment = popupRef.current && popupRef.current.contains(e.target as any);
            
            if (!isInsideComment) {
                if (currentActive) {
                    dismissedCommentIdRef.current = currentActive;
                }
                
                // Deselect / Collapse selection to end
                if (editor && !editor.isDestroyed) {
                    const { selection } = editor.state;
                    editor.commands.setTextSelection(selection.to);
                }

                setActiveCommentId(null);
                setCommentPopupPos(null);
                setEditingCommentId(null);
            }
        };

        editor.on('selectionUpdate', handleUpdate);
        editor.on('transaction', handleUpdate);
        
        // Initial run
        setTimeout(handleUpdate, 100);

        // Also track window resize/scroll for sidebar icons
        window.addEventListener('scroll', updateSidebarIcons, true);
        window.addEventListener('resize', updateSidebarIcons);
        
        // New dismissal listeners
        document.addEventListener('mousedown', handleGlobalMousedown);
        document.addEventListener('keydown', handleGlobalKeydown);
        // Use capture phase for scroll to catch it before it bubbles or if it doesn't bubble
        document.addEventListener('scroll', handleGlobalScroll, true);
        
        return () => {
            editor.off('selectionUpdate', handleUpdate);
            editor.off('transaction', handleUpdate);
            window.removeEventListener('scroll', updateSidebarIcons, true);
            window.removeEventListener('resize', updateSidebarIcons);
            document.removeEventListener('mousedown', handleGlobalMousedown);
            document.removeEventListener('keydown', handleGlobalKeydown);
            document.removeEventListener('scroll', handleGlobalScroll, true);
        };
    }, [editor, isEditing]);

    // Handlers
    const handleSave = async () => {
        // Mark as Edited in Metadata
        // Use local comments state as source of truth
        // PRUNE COMMENTS: removed orphaned ones that no longer have highlights in the doc
        if (!editor) return;
        const liveIds = new Set<string>();
        editor.state.doc.descendants((node) => {
            if (node.isText) { // Only check text nodes for marks
                node.marks.forEach(mark => {
                    if (mark.type.name === 'highlight' && mark.attrs.commentId) {
                        liveIds.add(mark.attrs.commentId);
                    }
                });
            }
        });

        const prunedComments = comments.filter(c => liveIds.has(c.id));
        setComments(prunedComments);

        const newMeta = { 
            ...file.metadata, 
            isSource, 
            comments: prunedComments, 
            edited: true 
        };
        
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
        
        console.log('[SourceEditor] Adding comment:', newComment);
        console.log('[SourceEditor] Current comments:', currentComments.length);
        console.log('[SourceEditor] New comments:', newComments.length);
        
        setComments(newComments);
        
        // Auto-save metadata
        if (onUpdateMetadata) {
             const newMeta = { ...file.metadata, isSource, comments: newComments };
             console.log('[SourceEditor] Calling onUpdateMetadata with comments:', newComments.length);
             await onUpdateMetadata(tags, newMeta);
             console.log('[SourceEditor] onUpdateMetadata completed');
        } else {
             console.warn('[SourceEditor] onUpdateMetadata is not provided!');
        }

        // --- NEW: Immediately open popup in Edit Mode ---
        // 1. Set IDs
        setActiveCommentId(commentId);
        setEditingCommentId(commentId);
        setEditingCommentText(""); // Fresh start
        setIsNewComment(true); // Mark as new comment

        // 2. Calculate Position IMMEDIATELY (Don't wait for effect)
        const view = editor.view;
        const coords = view.coordsAtPos(from);
        
        // Get editor bounds for initial width calculation
        const editorDom = view.dom;
        const editorRect = editorDom.getBoundingClientRect();
        
        // For new comments, start with min width (will expand if needed)
        const initialWidth = 260;
        
        setCommentPopupPos({ top: coords.bottom, left: coords.left, width: initialWidth });
        
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
        setIsNewComment(false); // Editing existing comment
    };

    const handleSaveCommentEdit = async () => {
        if (!editingCommentId) return;

        const currentComments = file.metadata?.comments || [];
        const newComments = currentComments.map((c: Comment) => 
            c.id === editingCommentId ? { ...c, text: editingCommentText } : c
        );

        console.log('[SourceEditor] Saving comment edit:', editingCommentId);
        console.log('[SourceEditor] New text:', editingCommentText);
        console.log('[SourceEditor] Updated comments count:', newComments.length);

        setComments(newComments);
        if (onUpdateMetadata) {
             const newMeta = { ...file.metadata, isSource, comments: newComments };
             console.log('[SourceEditor] Calling onUpdateMetadata for comment edit');
             await onUpdateMetadata(tags, newMeta);
             console.log('[SourceEditor] Comment edit saved');
        }
        
        // Force position recalculation to update width AND position
        const savedCommentId = editingCommentId;
        setEditingCommentId(null);
        setIsNewComment(false);
        
        // Manually trigger updatePopups to recalculate position
        // This is more reliable than waiting for selection/transaction events
        if (editor && !editor.isDestroyed) {
            // First set the active comment
            setActiveCommentId(savedCommentId);
            
            // Then trigger a position update after a short delay
            setTimeout(() => {
                // Find the highlight for this comment
                const view = editor.view;
                let found = false;
                
                editor.state.doc.descendants((node, pos) => {
                    if (found || !node.isText) return;
                    const mark = node.marks.find(m => m.type.name === 'highlight' && m.attrs.commentId === savedCommentId);
                    if (mark) {
                        const from = pos;
                        const to = pos + node.nodeSize;
                        const startCoords = view.coordsAtPos(from);
                        const endCoords = view.coordsAtPos(to);
                        
                        // Get editor bounds
                        const editorDom = view.dom;
                        const editorRect = editorDom.getBoundingClientRect();
                        
                        // Find the saved comment to check its new length
                        const comment = newComments.find((c: Comment) => c.id === savedCommentId);
                        const commentTextLength = comment?.text?.length || 0;
                        
                        // Recalculate width
                        let popupWidth;
                        if (commentTextLength >= 50) {
                            popupWidth = editorRect.width - 80;
                        } else {
                            popupWidth = Math.min(Math.max(260, commentTextLength * 10), 500);
                        }
                        
                        // Recalculate position (reuse same logic)
                        const highlightTop = startCoords.top;
                        const highlightBottom = endCoords.bottom;
                        
                        let estimatedPopupHeight;
                        if (commentTextLength === 0) {
                            estimatedPopupHeight = 150;
                        } else {
                            const charsPerLine = commentTextLength >= 50 ? 90 : 40;
                            const lineHeight = 20;
                            const numLines = Math.ceil(commentTextLength / charsPerLine);
                            const textHeight = numLines * lineHeight;
                            estimatedPopupHeight = Math.min(textHeight + 150, 400);
                        }
                        
                        const minSpacing = 30;
                        const viewportHeight = window.innerHeight;
                        const spaceAbove = highlightTop;
                        const spaceBelow = viewportHeight - highlightBottom;
                        
                        let top;
                        if (spaceBelow >= estimatedPopupHeight + minSpacing) {
                            top = highlightBottom + minSpacing;
                        } else if (spaceAbove >= estimatedPopupHeight + minSpacing) {
                            top = highlightTop - estimatedPopupHeight - minSpacing;
                        } else {
                            top = Math.max(10, highlightTop - estimatedPopupHeight - minSpacing);
                        }
                        
                        let left = startCoords.left;
                        if (left + popupWidth > editorRect.right) {
                            left = editorRect.right - popupWidth - 20;
                        }
                        if (left < editorRect.left) {
                            left = editorRect.left + 20;
                        }
                        
                        setCommentPopupPos({ top, left, width: popupWidth });
                        found = true;
                    }
                });
            }, 100);
        }
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

    const handleOpenLinkModal = () => {
        if (!editor) return;

        const { from, to } = editor.state.selection;
        const isCurrentlyLink = editor.isActive('link');
        
        let url = "";
        let text = editor.state.doc.textBetween(from, to, ' ');

        if (isCurrentlyLink) {
            const attrs = editor.getAttributes('link');
            url = attrs.href || "";
            // Expand to get the full link text if needed
            const range = getMarkRange(editor.state.doc.resolve(from), editor.schema.marks.link);
            if (range) {
                text = editor.state.doc.textBetween(range.from, range.to, ' ');
                setLinkRange({ from: range.from, to: range.to });
            }
        } else {
            setLinkRange({ from, to });
        }

        setLinkUrl(url);
        setLinkText(text);
        setIsLinkModalOpen(true);
    };

    const handleSaveLink = () => {
        if (!editor || !linkRange) return;

        editor.chain()
            .focus()
            .deleteRange({ from: linkRange.from, to: linkRange.to })
            .insertContent([
                {
                    type: 'text',
                    text: linkText || linkUrl,
                    marks: [
                        {
                            type: 'link',
                            attrs: { href: linkUrl }
                        }
                    ]
                }
            ])
            .run();

        setIsLinkModalOpen(false);
        setLinkRange(null);
    };

    const handleRemoveLink = () => {
        if (!editor || !linkRange) return;

        editor.chain()
            .focus()
            .extendMarkRange('link')
            .unsetLink()
            .run();

        setIsLinkModalOpen(false);
        setLinkRange(null);
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
                                <Icon name="Edit3" size={16} /> Edit
                            </button>
                         )}
                         
                         {isEditing && (
                             <button onClick={handleSave} className={styles.primaryButton} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                 <Icon name="Save" size={16} /> Save
                             </button>
                         )}

                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem', display: 'flex', alignItems: 'center' }}>
                            <Icon name="X" size={24} />
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
                            <span onClick={() => removeTag(t)} style={{ cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center' }}><Icon name="X" size={12} /></span>
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
                                        <span>Turn into</span> <Icon name="ChevronDown" size={14} />
                                        
                                        {activeDropdown === 'turnInto' && (
                                            <div className={styles.dropdownMenu} onClick={e => e.stopPropagation()}>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().setParagraph().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="Type" size={14} /> Text
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleHeading({level:1}).run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="Heading1" size={14} /> Heading 1
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleHeading({level:2}).run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="Heading2" size={14} /> Heading 2
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleHeading({level:3}).run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="Heading3" size={14} /> Heading 3
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleBulletList().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="List" size={14} /> Bullet List
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleOrderedList().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="ListOrdered" size={14} /> Numbered List
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleBlockquote().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="Quote" size={14} /> Quote
                                                </div>
                                                <div className={styles.dropdownItem} onClick={() => { editor.chain().focus().toggleCodeBlock().run(); editor.commands.setTextSelection(editor.state.selection.to); setActiveDropdown(null); setEditMenuPos(null); }}>
                                                    <Icon name="Code" size={14} /> Code Block
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
                                            <Icon name="Bold" size={16} />
                                        </button>
                                        <button 
                                            onClick={() => editor.chain().focus().toggleItalic().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('italic') ? styles.bubbleBtnActive : ''}`}
                                            title="Italic (Cmd+I)"
                                        >
                                            <Icon name="Italic" size={16} />
                                        </button>
                                        <button 
                                            onClick={() => editor.chain().focus().toggleStrike().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('strike') ? styles.bubbleBtnActive : ''}`}
                                            title="Strikethrough (Cmd+Shift+S)"
                                        >
                                            <Icon name="Strikethrough" size={16} />
                                        </button>
                                        <button 
                                            onClick={() => editor.chain().focus().toggleCode().run()} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('code') ? styles.bubbleBtnActive : ''}`}
                                            title="Code (Cmd+E)"
                                        >
                                            <Icon name="Code" size={16} />
                                        </button>

                                        <div className={styles.bubbleDivider} />

                                        <button 
                                            onClick={handleOpenLinkModal} 
                                            className={`${styles.bubbleBtn} ${editor.isActive('link') ? styles.bubbleBtnActive : ''}`}
                                            title="Link"
                                        >
                                            <Icon name="Link" size={16} />
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
                                            <Icon name="MessageSquareText" size={16} />
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
                                    position: 'fixed', 
                                    top: selectionMenuPos.top, 
                                    left: selectionMenuPos.left, 
                                    zIndex: 2147483647, // Max Z-Index
                                    visibility: 'visible'
                                }}>
                                    <button onClick={handleAddComment} title="Add Comment" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Icon name="MessageSquareText" size={14} /> Add Comment
                                    </button>
                                </div>
                            )}

                             {/* Comment Bubble (Manually Positioned) */}
                             {activeCommentId && commentPopupPos && (() => {
                                 const comment = comments.find(c => c.id === activeCommentId);
                                 if (!comment) return null;
                                 
                                 const isEditingThis = editingCommentId === comment.id;

                                 return (
                                     <div 
                                         ref={popupRef}
                                         className={styles.commentPopup} 
                                         style={{
                                             position: 'fixed',
                                             top: commentPopupPos.top, // Removed +10 - positioning logic handles spacing
                                             left: commentPopupPos.left,
                                             zIndex: 10000,
                                             backgroundColor: '#ffffff',
                                             width: commentPopupPos.width || 260,
                                             maxWidth: '90vw'
                                         }}
                                     >
                                         {isEditingThis ? (
                                             // Edit Mode (Clean Input)
                                             <div style={{ padding: '12px' }}>
                                                 <textarea 
                                                     value={editingCommentText}
                                                     onChange={e => setEditingCommentText(e.target.value)}
                                                     maxLength={1000}
                                                     style={{ 
                                                         width: '100%', 
                                                         minHeight: 80, 
                                                         maxHeight: editingCommentText.length >= 500 ? 200 : 'none',
                                                         overflowY: editingCommentText.length >= 500 ? 'auto' : 'visible',
                                                         padding: 8, 
                                                         border: '1px solid var(--accent)', 
                                                         borderRadius: 6,
                                                         fontSize: '0.95rem', 
                                                         fontFamily: 'inherit',
                                                         outline: 'none', 
                                                         resize: 'vertical',
                                                         background: 'var(--surface)'
                                                     }}
                                                     autoFocus
                                                 />
                                                 <div style={{ 
                                                     fontSize: '0.75rem', 
                                                     color: editingCommentText.length >= 900 ? 'var(--error, #ef4444)' : 'var(--secondary)', 
                                                     marginTop: 4,
                                                     textAlign: 'right'
                                                 }}>
                                                     {editingCommentText.length}/1000
                                                 </div>
                                                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                                     <button 
                                                         onClick={() => {
                                                             if (isNewComment && editingCommentId) {
                                                                 // New comment - delete it
                                                                 handleDeleteComment(editingCommentId);
                                                             } else {
                                                                 // Existing comment - just cancel edit
                                                                 setEditingCommentId(null);
                                                                 setIsNewComment(false);
                                                             }
                                                         }}
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
                                                  
                                                  <div className={styles.commentBody} style={{ 
                                                      maxHeight: '300px', 
                                                      overflowY: 'auto',
                                                      padding: '12px',
                                                      flex: 1
                                                  }}>
                                                      {comment.text}
                                                  </div>

                                                <div className={styles.commentActions}>
                                                    <button 
                                                        className={styles.commentActionBtn}
                                                        onClick={() => handleStartEditComment(comment)}
                                                        title="Edit Comment"
                                                    >
                                                        {/* Pencil Icon */}
                                                        <Icon name="Edit3" size={14} />
                                                    </button>
                                                    <button 
                                                        className={styles.commentActionBtn}
                                                        onClick={() => handleDeleteComment(comment.id)}
                                                        title="Delete Comment"
                                                        style={{ color: '#ef4444' }} // Red for delete
                                                    >
                                                        {/* Trash Icon */}
                                                        <Icon name="Trash2" size={14} />
                                                    </button>
                                                </div>
                                             </>
                                         )}
                                     </div>
                                 );
                             })()}

                             {/* Main Content */}
                             <div 
                                 ref={editorContainerRef}
                                 className={isEditing ? styles.editorEditable : styles.editorReadonly} 
                                 style={{ position: 'relative' }}
                             >
                                 {/* Sidebar Comment Icons Layer */}
                                 <div style={{ 
                                     position: 'absolute', 
                                     left: -25, // Adjusted from -40 to be closer
                                     top: 0, 
                                     bottom: 0, 
                                     width: 20, 
                                     pointerEvents: 'none',
                                     zIndex: 50
                                 }}>
                                     {sidebarIcons.map((icon, idx) => (
                                         <div 
                                             key={idx}
                                             style={{
                                                 position: 'absolute',
                                                 top: icon.top,
                                                 left: icon.left, 
                                                 pointerEvents: 'auto',
                                                 cursor: 'pointer',
                                                 display: 'flex',
                                                 alignItems: 'center',
                                                 justifyContent: 'center',
                                                 color: 'var(--secondary)',
                                                 opacity: 0.6,
                                                 transition: 'opacity 0.2s',
                                                 zIndex: 100
                                             }}
                                             onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                             onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                                             onClick={() => {
                                                 if (editor) {
                                                     // 1. Find the highlight range for this comment
                                                     let highlightRange: {from: number, to: number} | null = null;
                                                     editor.state.doc.descendants((node, pos) => {
                                                         if (highlightRange || !node.isText) return;
                                                         const mark = node.marks.find(m => m.type.name === 'highlight' && m.attrs.commentId === icon.firstCommentId);
                                                         if (mark) {
                                                             highlightRange = { from: pos, to: pos + node.nodeSize };
                                                         }
                                                     });

                                                     if (highlightRange) {
                                                      // Flag as intentional so it opens even in Edit Mode
                                                      lastInteractionRef.current = 'mouse';
                                                      // 2. Focus and select the highlight to trigger the regular popup logic
                                                      editor.chain().focus().setTextSelection(highlightRange).run();
                                                      setActiveCommentId(icon.firstCommentId);
                                                  }
                                                 }
                                             }}
                                         >
                                             <Icon name="MessageSquare" size={16} strokeWidth={2.5} />
                                             {icon.count > 1 && (
                                                 <span style={{
                                                     position: 'absolute',
                                                     top: -6,
                                                     right: -8,
                                                     backgroundColor: 'var(--accent)',
                                                     color: 'white',
                                                     fontSize: '10px',
                                                     fontWeight: 'bold',
                                                     minWidth: '16px',
                                                     height: '16px',
                                                     borderRadius: '50%',
                                                     display: 'flex',
                                                     alignItems: 'center',
                                                     justifyContent: 'center',
                                                     border: '1.5px solid white'
                                                 }}>
                                                     {icon.count}
                                                 </span>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                                 <EditorContent editor={editor} />
                             </div>
                        </>
                    )}
                </div>
            </div>

            {/* Link Editor Modal */}
            {isLinkModalOpen && (
                <div className={styles.modalOverlay} style={{ zIndex: 11000 }} onClick={() => setIsLinkModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ width: 400, padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0' }}>Edit Link</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', opacity: 0.6, marginBottom: 4 }}>Text to display</label>
                                <input 
                                    type="text" 
                                    value={linkText} 
                                    onChange={e => setLinkText(e.target.value)}
                                    placeholder="Display text"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}
                                    autoFocus
                                />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', opacity: 0.6, marginBottom: 4 }}>Link URL</label>
                                <input 
                                    type="text" 
                                    value={linkUrl} 
                                    onChange={e => setLinkUrl(e.target.value)}
                                    placeholder="https://..."
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}
                                />
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                <button 
                                    onClick={handleRemoveLink}
                                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
                                >
                                    Remove Link
                                </button>
                                
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button 
                                        onClick={() => setIsLinkModalOpen(false)}
                                        className={styles.secondaryButton}
                                        style={{ padding: '4px 12px' }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleSaveLink}
                                        className={styles.primaryButton}
                                        style={{ padding: '4px 12px' }}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                
                /* Comment Highlights - Subtle by default, vibrant when active */
                mark[data-comment-id] {
                    background-color: rgba(255, 237, 160, 0.3) !important; /* Pale yellow, subtle */
                    border-bottom: 1px solid rgba(255, 193, 7, 0.3);
                    border-radius: 2px;
                    padding: 2px 0;
                    transition: all 0.2s ease;
                    cursor: pointer;
                }
                
                mark[data-comment-id]:hover {
                    background-color: rgba(255, 237, 160, 0.5) !important;
                    border-bottom-color: rgba(255, 193, 7, 0.5);
                }
                
                /* Active highlight - when viewing its comment */
                mark[data-comment-id].active-comment {
                    background-color: rgba(255, 235, 59, 0.6) !important; /* More vibrant */
                    border-bottom: 2px solid rgba(255, 193, 7, 0.8);
                    box-shadow: 0 0 0 2px rgba(255, 235, 59, 0.15);
                }

                /* Link Styling */
                .ProseMirror a, 
                .ProseMirror a * {
                    color: #2563eb !important; /* Standard Blue for clear visibility */
                    text-decoration: underline !important;
                    text-decoration-thickness: 1.5px !important;
                    text-underline-offset: 3px;
                    cursor: pointer !important;
                }
                .ProseMirror a:hover {
                    color: #1d4ed8 !important;
                    text-decoration-thickness: 2px !important;
                }
            `}</style>
        </div>
    );
}
