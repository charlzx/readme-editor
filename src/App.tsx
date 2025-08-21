import React, { useState, useRef, useEffect, useMemo, type FC, type ReactNode } from 'react';
import {
    FileDown, Code, Bold, Italic, Link, List, ListOrdered, Heading,
    Table, Quote, Code2, Strikethrough, Copy,
    Undo, Redo, Search, Minimize, Maximize, Moon, Sun, FileText, Upload, MoreHorizontal
} from 'lucide-react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { marked } from 'marked';
import { markedHighlight } from "marked-highlight"
import DOMPurify from 'dompurify';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { useMeasure } from 'react-use';
import { motion, AnimatePresence } from 'framer-motion';

// --- TYPE DEFINITIONS ---
type Editor = editor.IStandaloneCodeEditor;
type MonacoInstance = Monaco;
type ToolbarActionParams = { prefix?: string; suffix?: string; type: string; };


// --- SYNTAX HIGHLIGHTING SETUP ---
marked.use(markedHighlight({
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : "plaintext"
    return hljs.highlight(code, { language }).value
  }
}))

// --- README TEMPLATES ---
const TEMPLATES: { [key: string]: string } = {
    professional: `# Project Title\n\n[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md) [![Build Status](https://img.shields.io/travis/com/user/repo.svg)](https://travis-ci.com/user/repo)\n\n## Description\n\nA detailed and compelling description of your project. Explain what it solves and why it's a valuable tool.\n\n## Features\n\n- ✨ Feature A: Solves a complex problem\n- 🚀 Feature B: Blazing fast performance\n- 🎨 Feature C: Beautifully designed UI\n\n## Tech Stack\n\n**Client:** React, TailwindCSS\n\n**Server:** Node, Express\n\n## Run Locally\n\nClone the project\n\n\`\`\`bash\n  git clone https://link-to-project\n\`\`\`\n\nGo to the project directory\n\n\`\`\`bash\n  cd my-project\n\`\`\`\n\nInstall dependencies\n\n\`\`\`bash\n  npm install\n\`\`\`\n\nStart the server\n\n\`\`\`bash\n  npm run start\n\`\`\`\n\n## Contributing\n\nContributions are always welcome! Please see \`contributing.md\` for ways to get started.`,
    profile: `# Hi, I'm [Your Name]! 👋\n\n## 🚀 About Me\nI'm a full stack developer, passionate about building accessible and user-friendly web applications.\n\n## 🛠️ Skills\nJavascript, React, Node.js, Python, ...\n\n## 🌱 I’m currently learning...\nExciting things about WebAssembly!\n\n## 🔗 Links\n[![linkedin](https://img.shields.io/badge/linkedin-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/your-profile/)\n[![twitter](https://img.shields.io/badge/twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/your-handle)`,
};

// --- HELPER & UTILITY FUNCTIONS ---
const formatText = (editor: Editor | null, { prefix = '', suffix = '', type }: ToolbarActionParams) => {
    if (!editor) return;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!selection || !model) return;

    if ((type === 'ul' || type === 'ol') && selection.startLineNumber !== selection.endLineNumber) {
        const { startLineNumber, endLineNumber } = selection;
        const edits = [];
        for (let i = startLineNumber; i <= endLineNumber; i++) {
            edits.push({
                range: { startLineNumber: i, startColumn: 1, endLineNumber: i, endColumn: 1 },
                text: type === 'ol' ? `${i - startLineNumber + 1}. ` : '- '
            });
        }
        editor.executeEdits('toolbar-format', edits);
        return;
    }

    if (type === 'heading') {
        const { startLineNumber } = selection;
        const lineContent = model.getLineContent(startLineNumber);
        const newText = prefix + lineContent.replace(/^#+\s*/, '');
        const range = { startLineNumber, startColumn: 1, endLineNumber: startLineNumber, endColumn: model.getLineMaxColumn(startLineNumber) };
        editor.executeEdits('toolbar-format', [{ range, text: newText }]);
        return;
    }
    
    let textToWrap: string;
    let editRange;

    if (selection.isEmpty()) {
        const lineNumber = selection.startLineNumber;
        textToWrap = model.getLineContent(lineNumber);
        editRange = { 
            startLineNumber: lineNumber, 
            startColumn: 1, 
            endLineNumber: lineNumber, 
            endColumn: model.getLineMaxColumn(lineNumber) 
        };
    } else {
        textToWrap = model.getValueInRange(selection);
        editRange = selection;
    }

    if (textToWrap.trim() === '') {
        const textToInsert = `${prefix}${suffix}`;
        const newPosition = {
            lineNumber: selection.startLineNumber,
            column: selection.startColumn + prefix.length
        };
        editor.executeEdits('toolbar-format', [{ range: selection, text: textToInsert, forceMoveMarkers: true }]);
        editor.setPosition(newPosition);
        editor.focus();
        return;
    }

    const textToInsert = `${prefix}${textToWrap}${suffix}`;
    editor.executeEdits('toolbar-format', [{ range: editRange, text: textToInsert, forceMoveMarkers: true }]);
    editor.focus();
};

const insertTableMarkdown = (editor: Editor | null, { rows, cols }: { rows: number, cols: number }) => {
    if (!editor) return;
    const header = '| ' + Array(cols).fill('Header').join(' | ') + ' |';
    const separator = '| ' + Array(cols).fill('---').join(' | ') + ' |';
    const body = Array(rows).fill('| ' + Array(cols).fill('Cell').join(' | ') + ' |').join('\n');
    const table = `${header}\n${separator}\n${body}\n`;
    const selection = editor.getSelection();
    if (selection) editor.executeEdits('insert-table', [{ range: selection, text: table }]);
    editor.focus();
};

// --- CHILD COMPONENTS ---
const Toast: FC<{ message: string, show: boolean }> = ({ message, show }) => (
    <AnimatePresence>
        {show && (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg z-[100]"
            >
                {message}
            </motion.div>
        )}
    </AnimatePresence>
);

const TableModal: FC<{ isOpen: boolean; onClose: () => void; onInsert: ({ rows, cols }: { rows: number; cols: number }) => void }> = ({ isOpen, onClose, onInsert }) => {
    const [rows, setRows] = useState(2);
    const [cols, setCols] = useState(3);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex justify-center items-center" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-gray-800 dark:text-gray-200" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4">Insert Table</h3>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="rows" className="block text-sm font-medium text-gray-600 dark:text-gray-300">Rows</label>
                        <input id="rows" type="number" value={rows} onChange={e => setRows(Math.max(1, parseInt(e.target.value, 10)))} className="mt-1 w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                        <label htmlFor="cols" className="block text-sm font-medium text-gray-600 dark:text-gray-300">Columns</label>
                        <input id="cols" type="number" value={cols} onChange={e => setCols(Math.max(1, parseInt(e.target.value, 10)))} className="mt-1 w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="py-2 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
                    <button onClick={() => { onInsert({ rows, cols }); onClose(); }} className="bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 shadow">Insert</button>
                </div>
            </div>
        </div>
    );
};

interface Command {
    name: string;
    action: () => void;
    icon: ReactNode;
}
const CommandPalette: FC<{ isOpen: boolean; onClose: () => void; commands: Command[] }> = ({ isOpen, onClose, commands }) => {
    const [search, setSearch] = useState('');
    const filteredCommands = useMemo(() =>
        commands.filter(cmd => cmd.name.toLowerCase().includes(search.toLowerCase())),
        [search, commands]
    );
    useEffect(() => { if (isOpen) setSearch(''); }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4" onClick={onClose}>
                    <motion.div
                        className="w-full max-w-3xl"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <div className="relative mb-4">
                            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Type a command or search..."
                                className="w-full bg-white/10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg py-3 pl-12 pr-4"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto p-1">
                            {filteredCommands.length > 0 ? (
                                filteredCommands.map((cmd) => (
                                    <motion.div
                                        key={cmd.name}
                                        onClick={() => { cmd.action(); onClose(); }}
                                        className="aspect-square flex flex-col items-center justify-center space-y-2 p-2 rounded-lg cursor-pointer bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        {cmd.icon}
                                        <span className="text-xs text-center font-medium">{cmd.name}</span>
                                    </motion.div>
                                ))
                            ) : (
                                <div className="col-span-full p-8 text-center text-gray-400">
                                    No commands found.
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const HoverDropdownMenu: FC<{ triggerIcon: ReactNode; label: string; children: ReactNode }> = ({ triggerIcon, label, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div 
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <button title={label} className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">
                {triggerIcon}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full mt-2 -ml-4 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50"
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface ToolbarItem {
    id: string;
    type: 'button' | 'divider' | 'dropdown';
    label?: string;
    icon?: ReactNode;
    action?: () => void;
    items?: { label: string; action: () => void }[];
}


// --- MAIN APP COMPONENT ---
const App: FC = () => {
    const [markdown, setMarkdown] = useState<string>(() => localStorage.getItem('readme-editor-content') || TEMPLATES.professional);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('readme-editor-theme') as 'light' | 'dark') || 'light');
    const [isZenMode, setIsZenMode] = useState<boolean>(false);
    const [isTableModalOpen, setTableModalOpen] = useState<boolean>(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
    const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

    const editorRef = useRef<Editor | null>(null);
    const monacoRef = useRef<MonacoInstance | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const openFileInputRef = useRef<HTMLInputElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const decorationsRef = useRef<string[]>([]);

    const [toolbarRef, { width: toolbarWidth }] = useMeasure<HTMLDivElement>();
    const isScrolling = useRef<boolean>(false);

    const stats = useMemo(() => {
        const lines = markdown.split('\n');
        const words = markdown.trim().split(/\s+/).filter(Boolean);
        return { lines: lines.length, words: words.length, chars: markdown.length };
    }, [markdown]);

    useEffect(() => { localStorage.setItem('readme-editor-content', markdown); }, [markdown]);
    useEffect(() => {
        localStorage.setItem('readme-editor-theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    useEffect(() => {
    const renderMarkdown = async () => {
        if (previewRef.current) {
            // Await the parsed markdown before sanitizing
            const parsed = await marked.parse(markdown);
            previewRef.current.innerHTML = DOMPurify.sanitize(parsed);
        }
    };
    renderMarkdown();
}, [markdown]);
    
    useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return;

        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const model = editor.getModel();
        if (!model) return;

        const imageRegex = /(!\[(.*?)\]\()(data:image\/[^;]+;base64,([a-zA-Z0-9+/=]+))(\))/g;
        const text = model.getValue();
        const newDecorations: editor.IModelDeltaDecoration[] = [];
        let match;

        while ((match = imageRegex.exec(text)) !== null) {
            const [fullMatch, , altText] = match;
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + fullMatch.length);
            
            newDecorations.push({
                range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                options: {
                    isWholeLine: false,
                    inlineClassName: 'hidden-image-markdown',
                    beforeContentClassName: `image-placeholder-widget ${theme}`,
                    before: {
                        content: `🖼️ ${altText || 'Image'}`,
                    },
                },
            });
        }
        
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);

    }, [markdown, theme]);
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsCommandPaletteOpen(p => !p);
            }
            if (e.key === 'Escape') {
                if (isCommandPaletteOpen) {
                    e.preventDefault();
                    setIsCommandPaletteOpen(false);
                } else if (isZenMode) {
                    e.preventDefault();
                    setIsZenMode(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isZenMode, isCommandPaletteOpen]);
    
    const showToast = (message: string) => {
        setToast({ show: true, message });
        setTimeout(() => setToast({ show: false, message: '' }), 2500);
    };

    const handleDownload = () => {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'README.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("File downloaded!");
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(markdown).then(() => showToast("Markdown copied!"));
    };

    const handleOpenFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setMarkdown(e.target?.result as string);
            reader.readAsText(file);
        }
    };
    
    const handleImageUpload = (file: File | undefined) => {
        if (!file?.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Image = e.target?.result;
            if (typeof base64Image !== 'string' || !editorRef.current) return;
            const textToInsert = `![${file.name}](${base64Image})`;
            const selection = editorRef.current.getSelection();
            if (selection) {
                editorRef.current.executeEdits('image-upload', [{ range: selection, text: textToInsert }]);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleEditorDidMount = (editor: Editor, monaco: MonacoInstance) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        editor.onDidScrollChange(e => {
            if (isScrolling.current || !e.scrollTopChanged) return;
            const editorScrollHeight = editor.getScrollHeight();
            const editorVisibleHeight = editor.getLayoutInfo().height;
            if (editorScrollHeight <= editorVisibleHeight) return;
            const scrollRatio = e.scrollTop / (editorScrollHeight - editorVisibleHeight);
            const preview = previewRef.current;
            if (preview) {
                isScrolling.current = true;
                preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
                setTimeout(() => { isScrolling.current = false; }, 100);
            }
        });
    };

    const toolbarActions = {
        undo: () => editorRef.current?.trigger('toolbar', 'undo', null),
        redo: () => editorRef.current?.trigger('toolbar', 'redo', null),
        heading: (level: number) => formatText(editorRef.current, { prefix: `${'#'.repeat(level)} `, type: 'heading' }),
        bold: () => formatText(editorRef.current, { prefix: '**', suffix: '**', type: 'bold' }),
        italic: () => formatText(editorRef.current, { prefix: '*', suffix: '*', type: 'italic' }),
        strikethrough: () => formatText(editorRef.current, { prefix: '~~', suffix: '~~', type: 'strikethrough' }),
        link: () => formatText(editorRef.current, { prefix: '[', suffix: '](url)', type: 'link' }),
        ul: () => formatText(editorRef.current, { prefix: '- ', type: 'ul' }),
        ol: () => formatText(editorRef.current, { prefix: '1. ', type: 'ol' }),
        quote: () => formatText(editorRef.current, { prefix: '> ', type: 'quote' }),
        code: () => formatText(editorRef.current, { prefix: '```\n', suffix: '\n```', type: 'code' }),
        image: () => imageInputRef.current?.click(),
        table: () => setTableModalOpen(true),
        applyTemplate: (key: 'professional' | 'profile') => setMarkdown(TEMPLATES[key]),
    };
    
    const toolbarItems: ToolbarItem[] = [
        { id: 'undo', type: 'button', label: 'Undo', icon: <Undo size={20} />, action: toolbarActions.undo },
        { id: 'redo', type: 'button', label: 'Redo', icon: <Redo size={20} />, action: toolbarActions.redo },
        { id: 'divider', type: 'divider' },
        { id: 'heading', type: 'dropdown', label: 'Headings', icon: <Heading size={20} />, items: [1,2,3,4,5,6].map(l => ({label: `Heading ${l}`, action: () => toolbarActions.heading(l)}))},
        { id: 'bold', type: 'button', label: 'Bold', icon: <Bold size={20} />, action: toolbarActions.bold },
        { id: 'italic', type: 'button', label: 'Italic', icon: <Italic size={20} />, action: toolbarActions.italic },
        { id: 'strikethrough', type: 'button', label: 'Strikethrough', icon: <Strikethrough size={20} />, action: toolbarActions.strikethrough },
        { id: 'link', type: 'button', label: 'Link', icon: <Link size={20} />, action: toolbarActions.link },
        { id: 'ul', type: 'button', label: 'Unordered List', icon: <List size={20} />, action: toolbarActions.ul },
        { id: 'ol', type: 'button', label: 'Ordered List', icon: <ListOrdered size={20} />, action: toolbarActions.ol },
        { id: 'quote', type: 'button', label: 'Blockquote', icon: <Quote size={20} />, action: toolbarActions.quote },
        { id: 'code', type: 'button', label: 'Code Block', icon: <Code2 size={20} />, action: toolbarActions.code },
        { id: 'table', type: 'button', label: 'Table', icon: <Table size={20} />, action: toolbarActions.table },
        { id: 'template', type: 'dropdown', label: 'Templates', icon: <FileText size={20} />, items: [
            {label: 'Professional README', action: () => toolbarActions.applyTemplate('professional')},
            {label: 'GitHub Profile', action: () => toolbarActions.applyTemplate('profile')}
        ]}
    ];
    
    const commands: Command[] = [
        { name: 'Open File', action: () => openFileInputRef.current?.click(), icon: <Upload size={28} /> },
        { name: 'Insert Table', action: toolbarActions.table, icon: <Table size={28} /> },
        { name: 'Pro Template', action: () => toolbarActions.applyTemplate('professional'), icon: <FileText size={28} /> },
        { name: 'Profile Template', action: () => toolbarActions.applyTemplate('profile'), icon: <FileText size={28} /> },
        { name: 'Toggle Zen Mode', action: () => setIsZenMode(p => !p), icon: <Maximize size={28} /> },
        { name: 'Toggle Theme', action: () => setTheme(t => t === 'light' ? 'dark' : 'light'), icon: <Moon size={28} /> },
    ];

    const visibleIconsCount = useMemo(() => {
        if (toolbarWidth < 480) return 4;
        if (toolbarWidth < 680) return 8;
        if (toolbarWidth < 850) return 12;
        return toolbarItems.length;
    }, [toolbarWidth, toolbarItems.length]);
    
    const visibleToolbarItems = toolbarItems.slice(0, visibleIconsCount);
    const hiddenToolbarItems = toolbarItems.slice(visibleIconsCount);

    return (
        <div className="font-sans flex flex-col h-screen antialiased text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900">
            <style>{`
                .hidden-image-markdown {
                    font-size: 0 !important;
                }
                .image-placeholder-widget::before {
                    font-size: 1rem;
                    padding: 0.2rem 0.5rem;
                    border-radius: 4px;
                    font-family: monospace;
                    display: inline-block;
                    margin: 0 0.2rem;
                }
                .image-placeholder-widget.light::before {
                    background-color: #eef2ff;
                    color: #4338ca;
                    border: 1px solid #c7d2fe;
                }
                .image-placeholder-widget.dark::before {
                    background-color: #312e81;
                    color: #a5b4fc;
                    border: 1px solid #4f46e5;
                }
            `}</style>
            <input type="file" ref={openFileInputRef} onChange={handleOpenFile} className="hidden" accept=".md,text/markdown" />
            <input type="file" ref={imageInputRef} onChange={(e) => handleImageUpload(e.target.files?.[0])} className="hidden" accept="image/*" />
            <Toast message={toast.message} show={toast.show} />
            <TableModal isOpen={isTableModalOpen} onClose={() => setTableModalOpen(false)} onInsert={({rows, cols}) => insertTableMarkdown(editorRef.current, {rows, cols})} />
            <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} commands={commands} />

            <header className={`bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 justify-between items-center z-40 flex-shrink-0 ${isZenMode ? 'hidden' : 'flex'}`}>
                <div className="flex items-center space-x-3">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg"><Code size={24} className="text-white" /></div>
                    <h1 className="text-xl font-semibold">README Editor</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={() => setIsCommandPaletteOpen(true)} className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg">
                        <Search size={16} />
                        <span className="hidden sm:inline">Search...</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded px-1.5 py-0.5 border dark:border-gray-600">Ctrl+K</span>
                    </button>
                    <button onClick={handleCopy} className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium py-2 px-3 rounded-lg"><Copy size={16} /><span className="hidden sm:inline">Copy</span></button>
                    <button onClick={handleDownload} className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-3 rounded-lg shadow-sm"><FileDown size={16} /><span className="hidden sm:inline">Download</span></button>
                </div>
            </header>

            <main className="flex-grow overflow-hidden">
                <PanelGroup direction="horizontal">
                    <Panel defaultSize={50} minSize={isZenMode ? 100 : 20}>
                        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
                            <div ref={toolbarRef} className={`bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-1.5 flex items-center space-x-1 flex-shrink-0 text-gray-500 dark:text-gray-400`}>
                                {visibleToolbarItems.map(item => {
                                    if (item.type === 'divider') return <div key={item.id} className="border-l h-6 border-gray-300 dark:border-gray-600 mx-1"></div>;
                                    if (item.type === 'dropdown') return (
                                        <HoverDropdownMenu key={item.id} triggerIcon={item.icon} label={item.label!}>
                                            {item.items?.map(sub => <button key={sub.label} onClick={sub.action} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">{sub.label}</button>)}
                                        </HoverDropdownMenu>
                                    );
                                    return <button key={item.id} onClick={item.action} title={item.label} className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">{item.icon}</button>;
                                })}
                                {hiddenToolbarItems.length > 0 && (
                                    <HoverDropdownMenu triggerIcon={<MoreHorizontal size={20}/>} label="More options">
                                        {hiddenToolbarItems.map(item => item.type !== 'divider' && (
                                            <button key={item.id} onClick={item.action} className="flex items-center space-x-2 w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                                {item.icon}
                                                <span>{item.label}</span>
                                            </button>
                                        ))}
                                    </HoverDropdownMenu>
                                )}
                                <div className="flex-grow" />
                                <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Toggle Theme" className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
                                <button onClick={() => setIsZenMode(!isZenMode)} title="Toggle Zen Mode" className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">{isZenMode ? <Minimize size={20} /> : <Maximize size={20} />}</button>
                            </div>
                            <div className="flex-grow h-full w-full overflow-hidden">
                                <Editor 
                                    height="100%" 
                                    language="markdown" 
                                    theme={theme === 'light' ? 'light' : 'vs-dark'} 
                                    value={markdown} 
                                    onChange={(value) => setMarkdown(value || '')} 
                                    onMount={handleEditorDidMount} 
                                    options={{
                                        wordWrap: 'on',
                                        minimap: { enabled: false },
                                        fontSize: 16,
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                    }}
                                />
                            </div>
                            {!isZenMode && (
                                <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-1 text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-4">
                                    <span>Lines: {stats.lines}</span>
                                    <span>Words: {stats.words}</span>
                                    <span>Chars: {stats.chars}</span>
                                </div>
                            )}
                        </div>
                    </Panel>
                    {!isZenMode && <PanelResizeHandle className="w-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-indigo-500" />}
                    {!isZenMode && <Panel defaultSize={50} minSize={20}>
                        <div
                            ref={previewRef}
                            className="prose max-w-none p-8 h-full overflow-y-auto bg-white dark:bg-gray-800"
                            role="region"
                            aria-label="Markdown preview"
                        />
                    </Panel>}
                </PanelGroup>
            </main>
        </div>
    );
};

export default App;