import React, {
    useCallback,
    useEffect,
    lazy,
    useMemo,
    useRef,
    useState,
    Suspense,
    type FC,
    type ReactNode,
} from 'react';
import {
    ArrowClockwiseIcon as Redo,
    ArrowCounterClockwiseIcon as Undo,
    ArrowsInIcon as Minimize,
    ArrowsOutIcon as Maximize,
    BracketsCurlyIcon as Code,
    ClockIcon as Clock3,
    CodeBlockIcon as Code2,
    CopyIcon as Copy,
    DownloadSimpleIcon as FileDown,
    FilePlusIcon as FilePlus2,
    FileTextIcon as FileText,
    FloppyDiskIcon as Save,
    FolderOpenIcon as FolderOpen,
    HouseIcon as Home,
    ImageIcon as Image,
    LinkIcon as Link,
    ListBulletsIcon as List,
    ListMagnifyingGlassIcon as Outline,
    ListNumbersIcon as ListOrdered,
    MagnifyingGlassIcon as Search,
    MoonIcon as Moon,
    PlusIcon as Plus,
    QuotesIcon as Quote,
    SidebarSimpleIcon as PanelRight,
    SunIcon as Sun,
    TableIcon as Table,
    TextBolderIcon as Bold,
    TextHIcon as Heading,
    TextItalicIcon as Italic,
    TextStrikethroughIcon as Strikethrough,
    TrashIcon as Trash2,
    UploadSimpleIcon as Upload,
    XIcon as Close,
} from '@phosphor-icons/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorTypes } from 'monaco-editor';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { AnimatePresence, motion } from 'framer-motion';

type EditorInstance = MonacoEditorTypes.IStandaloneCodeEditor;
type MonacoInstance = Monaco;
type ToolbarActionParams = { prefix?: string; suffix?: string; type: string };
type View = 'home' | 'editor';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

interface ReadmeProject {
    id: string;
    name: string;
    markdown: string;
    createdAt: string;
    updatedAt: string;
}

interface Command {
    name: string;
    action: () => void;
    icon: ReactNode;
}

interface ToolbarItem {
    id: string;
    type: 'button' | 'divider' | 'dropdown';
    label?: string;
    icon?: ReactNode;
    action?: () => void;
    items?: { label: string; action: () => void }[];
}

interface OutlineItem {
    id: string;
    level: number;
    text: string;
    lineNumber: number;
}

const STORAGE_KEY = 'readme-editor-projects';
const ACTIVE_PROJECT_KEY = 'readme-editor-active-project';
const LEGACY_CONTENT_KEY = 'readme-editor-content';
const THEME_KEY = 'readme-editor-theme';

marked.use(markedHighlight({
    highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
}));

const DEFAULT_MARKDOWN = '';

const createId = () => {
    if ('crypto' in window && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const inferProjectName = (markdown: string, fallback = 'Untitled README') => {
    const heading = markdown.split('\n').find(line => /^#\s+/.test(line));
    return heading?.replace(/^#\s+/, '').trim() || fallback;
};

const createProject = (name = 'Untitled README', markdown = DEFAULT_MARKDOWN): ReadmeProject => {
    const timestamp = nowIso();
    return {
        id: createId(),
        name,
        markdown,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
};

const loadProjects = (): ReadmeProject[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }

    const legacyContent = localStorage.getItem(LEGACY_CONTENT_KEY);
    if (legacyContent) {
        return [createProject(inferProjectName(legacyContent, 'Imported README'), legacyContent)];
    }

    return [];
};

const formatUpdatedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Recently';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

const formatRelativeTime = (value: string, now = Date.now()) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'recently';

    const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return formatUpdatedAt(value);
};

const getDownloadFilename = (name: string) => {
    const baseName = name
        .trim()
        .replace(/\.md$/i, '')
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return `${baseName || 'README'}.md`;
};

const getExcerpt = (markdown: string) => {
    const text = markdown
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[#>*_[\]()`~-]/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');
    return text || 'No content yet.';
};

const getReadmeOutline = (markdown: string): OutlineItem[] => (
    markdown
        .split('\n')
        .map((line, index) => {
            const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
            if (!match) return null;
            return {
                id: `${index}-${match[2]}`,
                level: match[1].length,
                text: match[2].replace(/[#_*`[\]()]/g, '').trim(),
                lineNumber: index + 1,
            };
        })
        .filter((item): item is OutlineItem => Boolean(item))
);

const formatText = (editor: EditorInstance | null, { prefix = '', suffix = '', type }: ToolbarActionParams) => {
    if (!editor) return;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!selection || !model) return;

    if ((type === 'ul' || type === 'ol') && selection.startLineNumber !== selection.endLineNumber) {
        const edits = [];
        for (let line = selection.startLineNumber; line <= selection.endLineNumber; line += 1) {
            edits.push({
                range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
                text: type === 'ol' ? `${line - selection.startLineNumber + 1}. ` : '- ',
            });
        }
        editor.executeEdits('toolbar-format', edits);
        return;
    }

    if (type === 'heading') {
        const lineNumber = selection.startLineNumber;
        const lineContent = model.getLineContent(lineNumber);
        const range = {
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber,
            endColumn: model.getLineMaxColumn(lineNumber),
        };
        editor.executeEdits('toolbar-format', [{ range, text: prefix + lineContent.replace(/^#+\s*/, '') }]);
        editor.focus();
        return;
    }

    const editRange = selection.isEmpty()
        ? {
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: model.getLineMaxColumn(selection.startLineNumber),
        }
        : selection;
    const textToWrap = selection.isEmpty()
        ? model.getLineContent(selection.startLineNumber)
        : model.getValueInRange(selection);

    if (textToWrap.trim() === '') {
        editor.executeEdits('toolbar-format', [{ range: selection, text: `${prefix}${suffix}`, forceMoveMarkers: true }]);
        editor.setPosition({ lineNumber: selection.startLineNumber, column: selection.startColumn + prefix.length });
        editor.focus();
        return;
    }

    editor.executeEdits('toolbar-format', [{ range: editRange, text: `${prefix}${textToWrap}${suffix}`, forceMoveMarkers: true }]);
    editor.focus();
};

const insertTableMarkdown = (editor: EditorInstance | null, { rows, cols }: { rows: number; cols: number }) => {
    if (!editor) return;
    const header = `| ${Array(cols).fill('Header').join(' | ')} |`;
    const separator = `| ${Array(cols).fill('---').join(' | ')} |`;
    const body = Array(rows).fill(`| ${Array(cols).fill('Cell').join(' | ')} |`).join('\n');
    const selection = editor.getSelection();
    if (selection) editor.executeEdits('insert-table', [{ range: selection, text: `${header}\n${separator}\n${body}\n` }]);
    editor.focus();
};

const Toast: FC<{ message: string; show: boolean }> = ({ message, show }) => (
    <AnimatePresence>
        {show && (
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="fixed bottom-5 right-5 z-[100] rounded-md border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm"
            >
                {message}
            </motion.div>
        )}
    </AnimatePresence>
);

const TableModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    onInsert: ({ rows, cols }: { rows: number; cols: number }) => void;
}> = ({ isOpen, onClose, onInsert }) => {
    const [rows, setRows] = useState(2);
    const [cols, setCols] = useState(3);
    if (!isOpen) return null;

    const updateNumber = (value: string, setter: (value: number) => void) => {
        const next = Number.parseInt(value, 10);
        setter(Number.isNaN(next) ? 1 : Math.max(1, next));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm" onClick={event => event.stopPropagation()}>
                <h3 className="text-lg font-semibold">Insert table</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    <label className="space-y-2 text-sm font-medium">
                        Rows
                        <input className="input" type="number" min={1} value={rows} onChange={event => updateNumber(event.target.value, setRows)} />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                        Columns
                        <input className="input" type="number" min={1} value={cols} onChange={event => updateNumber(event.target.value, setCols)} />
                    </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="btn btn-secondary">Cancel</button>
                    <button onClick={() => { onInsert({ rows, cols }); onClose(); }} className="btn btn-primary">Insert</button>
                </div>
            </div>
        </div>
    );
};

const ConfirmModal: FC<{
    project: ReadmeProject | null;
    onCancel: () => void;
    onConfirm: () => void;
}> = ({ project, onCancel, onConfirm }) => (
    <AnimatePresence>
        {project && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onCancel}>
                <motion.div
                    className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm"
                    onClick={event => event.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.98, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 8 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                    <h3 className="text-base font-semibold">Delete project</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        This will remove <span className="font-medium text-foreground">{project.name}</span> from local storage.
                    </p>
                    <div className="mt-5 flex justify-end gap-2">
                        <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
                        <button onClick={onConfirm} className="btn bg-destructive text-white hover:opacity-90">Delete</button>
                    </div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>
);

const CommandPalette: FC<{ isOpen: boolean; onClose: () => void; commands: Command[] }> = ({ isOpen, onClose, commands }) => {
    const [search, setSearch] = useState('');
    const filteredCommands = useMemo(
        () => commands.filter(command => command.name.toLowerCase().includes(search.toLowerCase())),
        [search, commands],
    );

    useEffect(() => {
        if (isOpen) setSearch('');
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
                    <motion.div
                        className="w-full max-w-2xl"
                        onClick={event => event.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.98, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 8 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                        <div className="rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-sm">
                            <div className="relative border-b border-border">
                                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search commands..."
                                    className="h-12 w-full bg-transparent pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground"
                                    autoFocus
                                />
                            </div>
                            <div className="grid max-h-[52vh] grid-cols-2 gap-1 overflow-y-auto p-2 sm:grid-cols-3">
                                {filteredCommands.map(command => (
                                    <button
                                        key={command.name}
                                        onClick={() => { command.action(); onClose(); }}
                                        className="flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                    >
                                        <span className="text-muted-foreground">{command.icon}</span>
                                        {command.name}
                                    </button>
                                ))}
                                {filteredCommands.length === 0 && (
                                    <div className="col-span-full px-3 py-8 text-center text-sm text-muted-foreground">No commands found.</div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

const HoverDropdownMenu: FC<{ triggerIcon: ReactNode; label: string; children: ReactNode; side?: 'bottom' | 'right' }> = ({ triggerIcon, label, children, side = 'bottom' }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
            <button title={label} className="icon-btn">{triggerIcon}</button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={`absolute z-50 min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm ${side === 'right' ? 'left-full top-0 ml-2' : 'left-0 top-full mt-2'}`}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const App: FC = () => {
    const [projects, setProjects] = useState<ReadmeProject[]>(loadProjects);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(() => localStorage.getItem(ACTIVE_PROJECT_KEY));
    const [view, setView] = useState<View>('home');
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light');
    const [isZenMode, setIsZenMode] = useState(false);
    const [isTableModalOpen, setTableModalOpen] = useState(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [isOutlineOpen, setIsOutlineOpen] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const [activeLine, setActiveLine] = useState(1);
    const [clock, setClock] = useState(() => Date.now());
    const [pendingDeleteProject, setPendingDeleteProject] = useState<ReadmeProject | null>(null);
    const [toast, setToast] = useState({ show: false, message: '' });

    const editorRef = useRef<EditorInstance | null>(null);
    const monacoRef = useRef<MonacoInstance | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const openFileInputRef = useRef<HTMLInputElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const isScrolling = useRef(false);

    const activeProject = useMemo(
        () => projects.find(project => project.id === activeProjectId) || null,
        [projects, activeProjectId],
    );
    const markdown = activeProject?.markdown || '';

    const stats = useMemo(() => {
        const lines = markdown.split('\n');
        const words = markdown.trim().split(/\s+/).filter(Boolean);
        return { lines: lines.length, words: words.length, chars: markdown.length };
    }, [markdown]);

    const outline = useMemo(() => getReadmeOutline(markdown), [markdown]);

    const activeOutlineId = useMemo(() => {
        let activeItem: OutlineItem | null = null;
        for (const item of outline) {
            if (item.lineNumber <= activeLine) activeItem = item;
            if (item.lineNumber > activeLine) break;
        }
        return activeItem?.id ?? null;
    }, [activeLine, outline]);

    const savedLabel = activeProject ? formatRelativeTime(activeProject.updatedAt, clock) : 'recently';

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }, [projects]);

    useEffect(() => {
        const interval = window.setInterval(() => setClock(Date.now()), 15000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeProjectId) {
            localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
        } else {
            localStorage.removeItem(ACTIVE_PROJECT_KEY);
        }
    }, [activeProjectId]);

    useEffect(() => {
        localStorage.setItem(THEME_KEY, theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    useEffect(() => {
        const renderMarkdown = async () => {
            if (!previewRef.current) return;
            const parsed = await marked.parse(markdown);
            previewRef.current.innerHTML = DOMPurify.sanitize(parsed);
        };
        renderMarkdown();
    }, [markdown]);

    useEffect(() => {
        if (!activeProject && view === 'editor') setView('home');
    }, [activeProject, view]);

    useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return;

        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const model = editor.getModel();
        if (!model) return;

        const imageRegex = /(!\[(.*?)\]\()(data:image\/[^;]+;base64,([a-zA-Z0-9+/=]+))(\))/g;
        const newDecorations: MonacoEditorTypes.IModelDeltaDecoration[] = [];
        let match;

        while ((match = imageRegex.exec(model.getValue())) !== null) {
            const [fullMatch, , altText] = match;
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + fullMatch.length);
            newDecorations.push({
                range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                options: {
                    inlineClassName: 'hidden-image-markdown',
                    beforeContentClassName: `image-placeholder-widget ${theme}`,
                    before: { content: `Image: ${altText || 'Upload'}` },
                },
            });
        }

        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    }, [markdown, theme]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setIsCommandPaletteOpen(open => !open);
            }
            if (event.key === 'Escape') {
                if (isCommandPaletteOpen) {
                    event.preventDefault();
                    setIsCommandPaletteOpen(false);
                } else if (isZenMode) {
                    event.preventDefault();
                    setIsZenMode(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isZenMode, isCommandPaletteOpen]);

    const showToast = useCallback((message: string) => {
        setToast({ show: true, message });
        window.setTimeout(() => setToast({ show: false, message: '' }), 2400);
    }, []);

    const updateActiveProject = useCallback((updates: Partial<ReadmeProject>) => {
        setProjects(current => current.map(project => (
            project.id === activeProjectId
                ? { ...project, ...updates, updatedAt: nowIso() }
                : project
        )));
    }, [activeProjectId]);

    const openProject = (projectId: string) => {
        setActiveProjectId(projectId);
        setView('editor');
    };

    const handleNewProject = () => {
        const project = createProject('Untitled README');
        setProjects(current => [project, ...current]);
        setActiveProjectId(project.id);
        setView('editor');
        showToast('Project created');
    };

    const requestDeleteProject = (projectId: string) => {
        const project = projects.find(item => item.id === projectId);
        if (project) setPendingDeleteProject(project);
    };

    const confirmDeleteProject = () => {
        if (!pendingDeleteProject) return;
        setProjects(current => current.filter(item => item.id !== pendingDeleteProject.id));
        if (activeProjectId === pendingDeleteProject.id) {
            setActiveProjectId(null);
            setView('home');
        }
        setPendingDeleteProject(null);
        showToast('Project deleted');
    };

    const handleDuplicateProject = (project: ReadmeProject) => {
        const duplicate = createProject(`${project.name} copy`, project.markdown);
        setProjects(current => [duplicate, ...current]);
        showToast('Project duplicated');
    };

    const handleDownload = () => {
        if (!activeProject) return;
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getDownloadFilename(activeProject.name);
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        showToast('File downloaded');
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(markdown).then(() => showToast('Markdown copied'));
    };

    const handleOpenFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = eventData => {
            const content = String(eventData.target?.result || '');
            const project = createProject(file.name.replace(/\.md$/i, '') || inferProjectName(content), content);
            setProjects(current => [project, ...current]);
            setActiveProjectId(project.id);
            setView('editor');
            showToast('File imported');
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleImageUpload = (file: File | undefined) => {
        if (!file?.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = event => {
            const base64Image = event.target?.result;
            if (typeof base64Image !== 'string' || !editorRef.current) return;
            const selection = editorRef.current.getSelection();
            if (selection) {
                editorRef.current.executeEdits('image-upload', [{ range: selection, text: `![${file.name}](${base64Image})` }]);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleEditorDidMount = (editor: EditorInstance, monaco: MonacoInstance) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setActiveLine(editor.getPosition()?.lineNumber ?? 1);
        editor.onDidChangeCursorPosition(event => setActiveLine(event.position.lineNumber));
        editor.onDidScrollChange(event => {
            if (isScrolling.current || !event.scrollTopChanged) return;
            setActiveLine(editor.getVisibleRanges()[0]?.startLineNumber ?? editor.getPosition()?.lineNumber ?? 1);
            const editorScrollHeight = editor.getScrollHeight();
            const editorVisibleHeight = editor.getLayoutInfo().height;
            if (editorScrollHeight <= editorVisibleHeight) return;

            const scrollRatio = event.scrollTop / (editorScrollHeight - editorVisibleHeight);
            const preview = previewRef.current;
            if (preview) {
                isScrolling.current = true;
                preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
                window.setTimeout(() => { isScrolling.current = false; }, 100);
            }
        });
    };

    const jumpToOutlineItem = (item: OutlineItem) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.setPosition({ lineNumber: item.lineNumber, column: 1 });
        editor.revealLineInCenter(item.lineNumber);
        editor.focus();
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
    };

    const toolbarItems: ToolbarItem[] = [
        { id: 'undo', type: 'button', label: 'Undo', icon: <Undo size={18} />, action: toolbarActions.undo },
        { id: 'redo', type: 'button', label: 'Redo', icon: <Redo size={18} />, action: toolbarActions.redo },
        { id: 'divider-1', type: 'divider' },
        { id: 'heading', type: 'dropdown', label: 'Headings', icon: <Heading size={18} />, items: [1, 2, 3, 4, 5, 6].map(level => ({ label: `Heading ${level}`, action: () => toolbarActions.heading(level) })) },
        { id: 'bold', type: 'button', label: 'Bold', icon: <Bold size={18} />, action: toolbarActions.bold },
        { id: 'italic', type: 'button', label: 'Italic', icon: <Italic size={18} />, action: toolbarActions.italic },
        { id: 'strikethrough', type: 'button', label: 'Strikethrough', icon: <Strikethrough size={18} />, action: toolbarActions.strikethrough },
        { id: 'link', type: 'button', label: 'Link', icon: <Link size={18} />, action: toolbarActions.link },
        { id: 'ul', type: 'button', label: 'Unordered List', icon: <List size={18} />, action: toolbarActions.ul },
        { id: 'ol', type: 'button', label: 'Ordered List', icon: <ListOrdered size={18} />, action: toolbarActions.ol },
        { id: 'quote', type: 'button', label: 'Blockquote', icon: <Quote size={18} />, action: toolbarActions.quote },
        { id: 'code', type: 'button', label: 'Code Block', icon: <Code2 size={18} />, action: toolbarActions.code },
        { id: 'image', type: 'button', label: 'Image', icon: <Image size={18} />, action: toolbarActions.image },
        { id: 'table', type: 'button', label: 'Table', icon: <Table size={18} />, action: toolbarActions.table },
    ];

    const commands: Command[] = [
        { name: 'New README', action: handleNewProject, icon: <FilePlus2 size={20} /> },
        { name: 'Open markdown file', action: () => openFileInputRef.current?.click(), icon: <Upload size={20} /> },
        { name: 'Back to home', action: () => setView('home'), icon: <Home size={20} /> },
        { name: 'Insert table', action: toolbarActions.table, icon: <Table size={20} /> },
        { name: 'Toggle README outline', action: () => setIsOutlineOpen(value => !value), icon: <Outline size={20} /> },
        { name: 'Toggle preview focus', action: () => setIsZenMode(value => !value), icon: <Maximize size={20} /> },
        { name: 'Toggle theme', action: () => setTheme(value => value === 'light' ? 'dark' : 'light'), icon: <Moon size={20} /> },
    ];

    const sortedProjects = useMemo(
        () => [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
        [projects],
    );

    const filteredProjects = useMemo(() => {
        const query = projectSearch.trim().toLowerCase();
        if (!query) return sortedProjects;
        return sortedProjects.filter(project => (
            project.name.toLowerCase().includes(query) ||
            project.markdown.toLowerCase().includes(query)
        ));
    }, [projectSearch, sortedProjects]);

    return (
        <div className="min-h-screen bg-background font-sans text-foreground antialiased">
            <style>{`
                .hidden-image-markdown { font-size: 0 !important; }
                .image-placeholder-widget::before {
                    display: inline-block;
                    margin: 0 0.2rem;
                    border-radius: 0.375rem;
                    padding: 0.125rem 0.5rem;
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                    font-size: 0.8125rem;
                }
                .image-placeholder-widget.light::before {
                    border: 1px solid hsl(var(--border));
                    background: hsl(var(--secondary));
                    color: hsl(var(--secondary-foreground));
                }
                .image-placeholder-widget.dark::before {
                    border: 1px solid hsl(var(--border));
                    background: hsl(var(--secondary));
                    color: hsl(var(--secondary-foreground));
                }
            `}</style>
            <input type="file" ref={openFileInputRef} onChange={handleOpenFile} className="hidden" accept=".md,text/markdown" />
            <input type="file" ref={imageInputRef} onChange={event => handleImageUpload(event.target.files?.[0])} className="hidden" accept="image/*" />
            <Toast message={toast.message} show={toast.show} />
            <TableModal isOpen={isTableModalOpen} onClose={() => setTableModalOpen(false)} onInsert={({ rows, cols }) => insertTableMarkdown(editorRef.current, { rows, cols })} />
            <ConfirmModal project={pendingDeleteProject} onCancel={() => setPendingDeleteProject(null)} onConfirm={confirmDeleteProject} />
            <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} commands={commands} />

            {view === 'home' && (
                <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-10 lg:px-8 lg:pt-16">
                    <button onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')} className="icon-btn absolute right-5 top-5 lg:right-8" title="Toggle theme">
                        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                    <header className="border-b border-border pb-8">
                        <div className="flex flex-col items-center gap-6 text-center">
                            <div className="grid size-11 place-items-center rounded-md border border-border bg-primary text-primary-foreground">
                                <Code size={23} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight">README Editor</h1>
                                <p className="mt-2 text-sm text-muted-foreground">Local projects, fast Markdown, clean preview.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button onClick={() => openFileInputRef.current?.click()} className="btn btn-secondary">
                                    <Upload size={16} /> Import markdown
                                </button>
                                <button onClick={handleNewProject} className="btn btn-primary">
                                    <Plus size={16} /> New blank README
                                </button>
                            </div>
                        </div>
                    </header>

                    <section className="py-8">
                        <div>
                            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold">Projects</h2>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <div className="relative">
                                        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            value={projectSearch}
                                            onChange={event => setProjectSearch(event.target.value)}
                                            placeholder="Search projects..."
                                            className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-3 text-[13px] outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 sm:w-56"
                                        />
                                    </div>
                                    <span className="w-fit rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{filteredProjects.length} of {projects.length}</span>
                                </div>
                            </div>

                            {projects.length > 0 ? (
                                <div className="space-y-3">
                                    {filteredProjects.map(project => (
                                        <article key={project.id} className="group flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground transition hover:border-muted-foreground/40 sm:flex-row sm:items-center">
                                            <button onClick={() => openProject(project.id)} className="flex min-w-0 flex-1 items-start gap-4 text-left">
                                                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground">
                                                    <FileText size={19} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                        <h3 className="max-w-full truncate text-base font-semibold">{project.name}</h3>
                                                        <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                                                            <Clock3 size={13} /> {formatUpdatedAt(project.updatedAt)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{getExcerpt(project.markdown)}</p>
                                                </div>
                                            </button>
                                            <div className="flex shrink-0 items-center gap-2 sm:border-l sm:border-border sm:pl-4">
                                                <button onClick={() => openProject(project.id)} className="btn btn-secondary h-8 px-2.5 text-xs">
                                                    <FolderOpen size={14} /> Open
                                                </button>
                                                <button onClick={() => handleDuplicateProject(project)} className="btn btn-ghost h-8 px-2.5 text-xs">
                                                    <Copy size={14} /> Duplicate
                                                </button>
                                                <button onClick={() => requestDeleteProject(project.id)} className="icon-btn size-8 text-destructive" title="Delete project">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                    {filteredProjects.length === 0 && (
                                        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                                            No projects match “{projectSearch}”.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
                                    <div className="mx-auto grid size-12 place-items-center rounded-md bg-secondary text-secondary-foreground">
                                        <FilePlus2 size={23} />
                                    </div>
                                    <h2 className="mt-4 text-lg font-semibold">No projects yet</h2>
                                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create a blank README or import a Markdown file to keep it available in this browser.</p>
                                    <div className="mt-5 flex justify-center gap-2">
                                        <button onClick={handleNewProject} className="btn btn-primary">
                                            <Plus size={16} /> New blank README
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </section>
                </main>
            )}

            {view === 'editor' && activeProject && (
                <div className="flex h-screen flex-col overflow-hidden">
                    <header className={`flex-shrink-0 border-b border-border bg-card/95 px-3 py-2 backdrop-blur ${isZenMode ? 'hidden' : 'block'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <button onClick={() => setView('home')} className="icon-btn" title="Home">
                                    <Home size={18} />
                                </button>
                                <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
                                    <Code size={19} />
                                </div>
                                <input
                                    value={activeProject.name}
                                    onChange={event => updateActiveProject({ name: event.target.value })}
                                    className="min-w-0 max-w-[52vw] rounded-md border border-transparent bg-transparent px-2 py-1 text-base font-semibold outline-none hover:border-border focus:border-ring focus:bg-background"
                                    aria-label="Project name"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsCommandPaletteOpen(true)} className="btn btn-secondary">
                                    <Search size={15} />
                                    <span className="hidden sm:inline">Search</span>
                                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl K</kbd>
                                </button>
                                <button onClick={handleCopy} className="icon-btn" title="Copy markdown"><Copy size={17} /></button>
                                <button onClick={handleDownload} className="btn btn-primary"><FileDown size={16} /> Download</button>
                                <button onClick={() => requestDeleteProject(activeProject.id)} className="icon-btn text-destructive" title="Delete project"><Trash2 size={17} /></button>
                            </div>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1 overflow-hidden">
                        <PanelGroup direction="horizontal">
                            <Panel defaultSize={50} minSize={isZenMode ? 100 : 24}>
                                <div className="relative flex h-full flex-col bg-background">
                                    <div className="absolute bottom-3 left-3 top-3 z-40 flex w-14 flex-col rounded-lg border border-border bg-card/95 p-1.5 text-muted-foreground shadow-sm backdrop-blur">
                                        <div className="flex flex-col gap-1">
                                            <button onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')} title="Toggle theme" className="icon-btn">{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
                                            <button onClick={() => setIsZenMode(!isZenMode)} title={isZenMode ? 'Exit fullscreen' : 'Enter fullscreen'} className="icon-btn">{isZenMode ? <Minimize size={18} /> : <Maximize size={18} />}</button>
                                        </div>
                                        <div className="my-1.5 border-t border-border" />
                                        <button
                                            onClick={() => setIsOutlineOpen(value => !value)}
                                            title="README outline"
                                            className={`icon-btn ${isOutlineOpen ? 'bg-accent text-accent-foreground' : ''}`}
                                        >
                                            <Outline size={18} />
                                        </button>
                                        <div className="my-1.5 border-t border-border" />
                                        <div className="toolbar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1.5">
                                            {toolbarItems.map(item => {
                                                if (item.type === 'divider') return <div key={item.id} className="my-1.5 border-t border-border" />;
                                                if (item.type === 'dropdown') {
                                                    return (
                                                        <HoverDropdownMenu key={item.id} triggerIcon={item.icon} label={item.label || ''} side="right">
                                                            {item.items?.map(sub => (
                                                                <button key={sub.label} onClick={sub.action} className="dropdown-item">{sub.label}</button>
                                                            ))}
                                                        </HoverDropdownMenu>
                                                    );
                                                }
                                                return <button key={item.id} onClick={item.action} title={item.label} className="icon-btn">{item.icon}</button>;
                                            })}
                                        </div>
                                        <div className="my-1.5 border-t border-border" />
                                        <button onClick={() => openFileInputRef.current?.click()} className="icon-btn" title="Open file"><Upload size={18} /></button>
                                    </div>
                                    <AnimatePresence>
                                        {isOutlineOpen && (
                                            <motion.aside
                                                className="absolute bottom-3 left-[4.25rem] top-3 z-30 flex w-72 flex-col rounded-lg border border-border bg-card/95 text-card-foreground shadow-sm backdrop-blur"
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -8 }}
                                                transition={{ duration: 0.16, ease: 'easeOut' }}
                                            >
                                                <div className="flex h-11 items-center justify-between border-b border-border px-3">
                                                    <div className="flex items-center gap-2 text-sm font-medium">
                                                        <Outline size={16} className="text-muted-foreground" />
                                                        Outline
                                                    </div>
                                                    <button onClick={() => setIsOutlineOpen(false)} className="icon-btn size-7" title="Close outline">
                                                        <Close size={15} />
                                                    </button>
                                                </div>
                                                {outline.length > 0 ? (
                                                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                                                        {outline.map(item => (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => jumpToOutlineItem(item)}
                                                                className={`block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${activeOutlineId === item.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                                                                style={{ paddingLeft: `${Math.min(item.level - 1, 4) * 12 + 8}px` }}
                                                                title={item.text}
                                                            >
                                                                {item.text}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                                                        Add headings to build an outline.
                                                    </div>
                                                )}
                                            </motion.aside>
                                        )}
                                    </AnimatePresence>
                                    <div className={`min-h-0 flex-1 overflow-hidden transition-[padding] ${isOutlineOpen ? 'pl-[22rem]' : 'pl-14'}`}>
                                        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading editor...</div>}>
                                            <MonacoEditor
                                                height="100%"
                                                language="markdown"
                                                theme={theme === 'light' ? 'light' : 'vs-dark'}
                                                value={markdown}
                                                onChange={value => updateActiveProject({ markdown: value || '' })}
                                                onMount={handleEditorDidMount}
                                                options={{
                                                    wordWrap: 'on',
                                                    minimap: { enabled: false },
                                                    fontSize: 14,
                                                    lineHeight: 22,
                                                    scrollBeyondLastLine: false,
                                                    automaticLayout: true,
                                                    padding: { top: 16, bottom: 16 },
                                                }}
                                            />
                                        </Suspense>
                                    </div>
                                    {!isZenMode && (
                                        <div className="flex flex-shrink-0 items-center gap-4 border-t border-border bg-muted/50 px-4 py-1.5 pl-16 text-xs text-muted-foreground">
                                            <span><Save size={13} className="mr-1 inline" /> Saved {savedLabel}</span>
                                            <span>Lines {stats.lines}</span>
                                            <span>Words {stats.words}</span>
                                            <span>Chars {stats.chars}</span>
                                        </div>
                                    )}
                                </div>
                            </Panel>
                            {!isZenMode && <PanelResizeHandle className="w-1.5 bg-border transition hover:bg-primary" />}
                            {!isZenMode && (
                                <Panel defaultSize={50} minSize={24}>
                                    <div className="flex h-full flex-col bg-card">
                                        <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-medium">
                                            <PanelRight size={16} className="text-muted-foreground" /> Preview
                                        </div>
                                        <div
                                            ref={previewRef}
                                            className="markdown-preview prose max-w-none flex-1 overflow-y-auto p-8 dark:prose-invert"
                                            role="region"
                                            aria-label="Markdown preview"
                                        />
                                    </div>
                                </Panel>
                            )}
                        </PanelGroup>
                    </main>
                </div>
            )}
        </div>
    );
};

export default App;
