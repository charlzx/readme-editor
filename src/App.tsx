import React, {
    useCallback,
    useEffect,
    lazy,
    useMemo,
    useRef,
    useState,
    Suspense,
    type FC,
} from 'react';
import {
    ArrowClockwiseIcon as Redo,
    ArrowCounterClockwiseIcon as Undo,
    ArrowLeftIcon as ArrowLeft,
    ClockIcon as Clock3,
    CodeBlockIcon as Code2,
    CopyIcon as Copy,
    DownloadSimpleIcon as FileDown,
    FolderOpenIcon as FolderOpen,
    ImageIcon as Image,
    LinkIcon as Link,
    ListBulletsIcon as List,
    ListNumbersIcon as ListOrdered,
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
    SlidersIcon as Sliders,
    UploadSimpleIcon as Upload,
    FloppyDiskIcon as Save,
    PlusIcon as FilePlus2,
    FileTextIcon as FileText,
    HouseIcon as Home,
    ListMagnifyingGlassIcon as Outline,
    ArrowsOutIcon as Maximize,
    MagnifyingGlassIcon as Search,
} from '@phosphor-icons/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorTypes } from 'monaco-editor';
import DOMPurify from 'dompurify';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import 'highlight.js/styles/github-dark.css';
import { AnimatePresence, motion } from 'framer-motion';

// Hooks & Workers
import { useMarkdownWorker } from './hooks/useMarkdownWorker';

// Modular Decoupled Components
import { CommandPalette, type Command } from './components/CommandPalette';
import { TableModal } from './components/TableModal';
import { ProjectNameEditor } from './components/ProjectNameEditor';
import { OutlinePanel, type OutlineItem } from './components/OutlinePanel';
import { HistoryPanel, type ReadmeVersion } from './components/HistoryPanel';
import { Toolbar, type ToolbarItem } from './components/Toolbar';

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
    versions?: ReadmeVersion[];
}

const STORAGE_KEY = 'readme-editor-projects';
const ACTIVE_PROJECT_KEY = 'readme-editor-active-project';
const LEGACY_CONTENT_KEY = 'readme-editor-content';
const THEME_KEY = 'readme-editor-theme';

const DEFAULT_MARKDOWN = '';

const createId = () => {
    if ('crypto' in window && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const inferProjectName = (markdown: string, fallback = 'Untitled Markdown') => {
    const heading = markdown.split('\n').find(line => /^#\s+/.test(line));
    return heading?.replace(/^#\s+/, '').trim() || fallback;
};

const createProject = (name = 'Untitled Markdown', markdown = DEFAULT_MARKDOWN): ReadmeProject => {
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
        return [createProject(inferProjectName(legacyContent, 'Imported Markdown'), legacyContent)];
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

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
                className="fixed bottom-5 right-5 z-[100] rounded-md border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm select-none"
            >
                {message}
            </motion.div>
        )}
    </AnimatePresence>
);

const App: FC = () => {
    const { compileMarkdown } = useMarkdownWorker();
    const [projects, setProjects] = useState<ReadmeProject[]>(loadProjects);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(() => localStorage.getItem(ACTIVE_PROJECT_KEY));
    const [view, setView] = useState<View>('home');
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light');
    const [isZenMode, setIsZenMode] = useState(false);
    const [isTableModalOpen, setTableModalOpen] = useState(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [isOutlineOpen, setIsOutlineOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const [activeLine, setActiveLine] = useState(1);
    const [clock, setClock] = useState(() => Date.now());
    const [toast, setToast] = useState({ show: false, message: '' });
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(true);
    const [wordGoal, setWordGoal] = useState<number | null>(null);
    const [isGoalInputOpen, setIsGoalInputOpen] = useState(false);
    const [isToolbarVisible, setIsToolbarVisible] = useState(true);

    const editorRef = useRef<EditorInstance | null>(null);
    const monacoRef = useRef<MonacoInstance | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const openFileInputRef = useRef<HTMLInputElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const isScrolling = useRef(false);
    const completionProviderRef = useRef<any>(null);
    const lastAutoCheckpointRef = useRef<string>('');

    const activeProject = useMemo(
        () => projects.find(project => project.id === activeProjectId) || null,
        [projects, activeProjectId],
    );
    const markdown = activeProject?.markdown || '';

    const stats = useMemo(() => {
        const lines = markdown.split('\n');
        const words = markdown.trim().split(/\s+/).filter(Boolean);
        // Estimated reading time based on standard 200 WPM index
        const readingTime = Math.ceil(words.length / 200);
        return { lines: lines.length, words: words.length, chars: markdown.length, readingTime };
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
        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
                completionProviderRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!previewRef.current) return;
        compileMarkdown(markdown, (compiledHtml, error) => {
            if (previewRef.current) {
                if (error) {
                    previewRef.current.innerHTML = `<div class="p-4 text-destructive bg-destructive/10 border border-destructive/20 rounded-md font-mono text-sm">${error}</div>`;
                } else {
                    previewRef.current.innerHTML = DOMPurify.sanitize(compiledHtml);
                    
                    // Enable checkboxes inside the preview to make them interactive
                    const checkboxes = previewRef.current.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => {
                        cb.removeAttribute('disabled');
                        cb.classList.add('cursor-pointer', 'accent-accent', 'transition-all');
                    });
                }
            }
        });
    }, [markdown, compileMarkdown]);

    useEffect(() => {
        if (!activeProject && view === 'editor') setView('home');
    }, [activeProject, view]);

    useEffect(() => {
        if (!activeProject) {
            lastAutoCheckpointRef.current = '';
            return;
        }
        if (!lastAutoCheckpointRef.current) {
            lastAutoCheckpointRef.current = activeProject.markdown;
            return;
        }

        const interval = window.setInterval(() => {
            if (activeProject.markdown !== lastAutoCheckpointRef.current) {
                const timestamp = nowIso();
                const newVersion: ReadmeVersion = {
                    id: createId(),
                    timestamp,
                    name: `Auto-save Backup (${formatUpdatedAt(timestamp)})`,
                    markdown: activeProject.markdown,
                    size: new Blob([activeProject.markdown]).size
                };
                setProjects(current => current.map(project => {
                    if (project.id === activeProjectId) {
                        const pastVersions = project.versions || [];
                        return { ...project, versions: [newVersion, ...pastVersions].slice(0, 15) };
                    }
                    return project;
                }));
                lastAutoCheckpointRef.current = activeProject.markdown;
            }
        }, 10 * 60 * 1000);

        return () => window.clearInterval(interval);
    }, [activeProject?.id, activeProject?.markdown, activeProjectId]);

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
        const project = createProject('Untitled Markdown');
        setProjects(current => [project, ...current]);
        setActiveProjectId(project.id);
        setView('editor');
        showToast('Project created');
    };

    const handleCreateCheckpoint = useCallback((customName?: string) => {
        if (!activeProject) return;
        const timestamp = nowIso();
        const newVersion: ReadmeVersion = {
            id: createId(),
            timestamp,
            name: customName?.trim() || `Backup ${formatUpdatedAt(timestamp)}`,
            markdown: activeProject.markdown,
            size: new Blob([activeProject.markdown]).size
        };

        setProjects(current => current.map(project => {
            if (project.id === activeProjectId) {
                const pastVersions = project.versions || [];
                const updatedVersions = [newVersion, ...pastVersions].slice(0, 15);
                return { ...project, versions: updatedVersions, updatedAt: nowIso() };
            }
            return project;
        }));
        showToast('Version checkpoint saved');
    }, [activeProject, activeProjectId, showToast]);

    const handleDeleteCheckpoint = useCallback((versionId: string) => {
        if (!activeProjectId) return;
        setProjects(current => current.map(project => {
            if (project.id === activeProjectId) {
                const updatedVersions = (project.versions || []).filter(v => v.id !== versionId);
                return { ...project, versions: updatedVersions };
            }
            return project;
        }));
        showToast('Checkpoint deleted');
    }, [activeProjectId, showToast]);

    const handleRestoreCheckpoint = useCallback((version: ReadmeVersion) => {
        if (!activeProject) return;
        const pastVersions = activeProject.versions || [];
        const currentSnapshot: ReadmeVersion = {
            id: createId(),
            timestamp: nowIso(),
            name: `Pre-restore Backup (${formatUpdatedAt(nowIso())})`,
            markdown: activeProject.markdown,
            size: new Blob([activeProject.markdown]).size
        };

        updateActiveProject({
            markdown: version.markdown,
            versions: [currentSnapshot, ...pastVersions].slice(0, 15)
        });

        showToast('Version restored (Pre-restore backup saved)');
    }, [activeProject, updateActiveProject, showToast]);

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

            // Initialize with an Initial Import version backup
            const initialVersion: ReadmeVersion = {
                id: createId(),
                timestamp: nowIso(),
                name: 'Initial Import',
                markdown: content,
                size: new Blob([content]).size
            };
            project.versions = [initialVersion];

            setProjects(current => [project, ...current]);
            setActiveProjectId(project.id);
            setView('editor');
            showToast('File imported');
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const uploadToCatbox = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', file);

        const response = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const url = await response.text();
        return url.trim();
    };

    const handleImageUpload = async (file: File | undefined) => {
        if (!file) return;
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            showToast('Supported files: Images and Videos');
            return;
        }

        // Enforce 100MB file size limit for videos
        if (isVideo && file.size > 100 * 1024 * 1024) {
            showToast('Video exceeds 100MB limit');
            return;
        }

        const editor = editorRef.current;
        if (!editor || !monacoRef.current) return;

        const selection = editor.getSelection();
        if (!selection) return;

        showToast('Uploading asset to cloud...');

        try {
            // 1. Try uploading to Catbox first for a lightweight direct HTTPS URL
            const url = await uploadToCatbox(file);
            
            let textToInsert = '';
            if (isImage) {
                textToInsert = `![${file.name}](${url})`;
            } else {
                textToInsert = `<video src="${url}" controls class="my-4 max-w-full rounded-lg shadow-sm border border-border"></video>`;
            }

            editor.executeEdits('image-upload', [{ range: selection, text: textToInsert }]);
            showToast('Asset uploaded and inserted');
        } catch (error) {
            console.error('Cloud upload failed, falling back to local reference-style base64:', error);
            showToast('Offline or upload failed. Using local reference...');

            // 2. Fallback to reference-style Base64 definition at the bottom of the document
            const reader = new FileReader();
            reader.onload = event => {
                const base64Data = event.target?.result;
                if (typeof base64Data !== 'string') return;

                const model = editor.getModel();
                if (!model) return;

                const lineCount = model.getLineCount();
                const lastLineLen = model.getLineMaxColumn(lineCount);

                const refId = `ref-${isImage ? 'img' : 'vid'}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
                
                let inlineText = '';
                let refDefinition = '';

                if (isImage) {
                    inlineText = `![${file.name}][${refId}]`;
                    refDefinition = `\n\n[${refId}]: ${base64Data}`;
                } else {
                    inlineText = `<video src="[${refId}]" controls class="my-4 max-w-full rounded-lg shadow-sm border border-border"></video>`;
                    refDefinition = `\n\n[${refId}]: ${base64Data}`;
                }

                // Insert inline reference at cursor and definition at the bottom of the file in one undo transaction
                editor.executeEdits('image-upload-fallback', [
                    {
                        range: selection,
                        text: inlineText
                    },
                    {
                        range: new monacoRef.current.Range(lineCount, lastLineLen, lineCount, lastLineLen),
                        text: refDefinition
                    }
                ]);

                showToast('Local reference inserted at bottom of document');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEditorDidMount = (editor: EditorInstance, monaco: MonacoInstance) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        setActiveLine(editor.getPosition()?.lineNumber ?? 1);
        editor.onDidChangeCursorPosition(event => setActiveLine(event.position.lineNumber));

        // Attach drag & drop / paste listeners for premium image/video imports
        const domNode = editor.getDomNode();
        if (domNode) {
            domNode.addEventListener('drop', (event: DragEvent) => {
                const file = event.dataTransfer?.files?.[0];
                if (file) {
                    event.preventDefault();
                    event.stopPropagation();
                    const target = editor.getTargetAtClientPoint(event.clientX, event.clientY);
                    if (target?.position) {
                        editor.setPosition(target.position);
                        editor.focus();
                    }
                    handleImageUpload(file);
                }
            }, true);

            domNode.addEventListener('paste', (event: ClipboardEvent) => {
                const file = event.clipboardData?.files?.[0];
                if (file) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleImageUpload(file);
                }
            }, true);
        }

        // Notion-style slash commands completion provider registration
        if (monaco && !completionProviderRef.current) {
            completionProviderRef.current = monaco.languages.registerCompletionItemProvider('markdown', {
                triggerCharacters: ['/'],
                provideCompletionItems: (model: any, position: any) => {
                    const lineContent = model.getLineContent(position.lineNumber);

                    // Only trigger slash commands if / is at the start of a line (with optional spaces)
                    const textBeforeSlash = lineContent.substring(0, position.column - 1);
                    if (textBeforeSlash.trim() !== '') {
                        return { suggestions: [] };
                    }

                    const range = {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column - 1, // cover the '/' character
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    };

                    const suggestions = [
                        {
                            label: 'Heading 1',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '# ',
                            detail: 'Insert H1 header',
                            documentation: 'Creates a large section heading',
                            range
                        },
                        {
                            label: 'Heading 2',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '## ',
                            detail: 'Insert H2 header',
                            documentation: 'Creates a medium section heading',
                            range
                        },
                        {
                            label: 'Heading 3',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '### ',
                            detail: 'Insert H3 header',
                            documentation: 'Creates a small section heading',
                            range
                        },
                        {
                            label: 'Bullet List',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '- ',
                            detail: 'Insert unordered list item',
                            documentation: 'Creates a bulleted list',
                            range
                        },
                        {
                            label: 'Numbered List',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '1. ',
                            detail: 'Insert ordered list item',
                            documentation: 'Creates a numbered list',
                            range
                        },
                        {
                            label: 'Blockquote',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '> ',
                            detail: 'Insert blockquote text block',
                            documentation: 'Creates a citations blockquote block',
                            range
                        },
                        {
                            label: 'Code Block',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: '```\n$0\n```',
                            detail: 'Insert code block',
                            documentation: 'Creates a syntax highlighted code snippet',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range
                        },
                        {
                            label: 'Table',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |',
                            detail: 'Insert markdown table',
                            documentation: 'Creates a 2x2 grid data table',
                            range
                        },
                        {
                            label: 'Bold Text',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '**$0**',
                            detail: 'Insert bold markup',
                            documentation: 'Emphasis strong styled text',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range
                        },
                        {
                            label: 'Italic Text',
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: '*$0*',
                            detail: 'Insert italic markup',
                            documentation: 'Emphasis italic styled text',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range
                        },
                        {
                            label: 'Image Link',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: '![alt text]($0)',
                            detail: 'Insert image markup',
                            documentation: 'Embeds an image using a URL link',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range
                        },
                        {
                            label: 'Hyperlink',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: '[link text]($0)',
                            detail: 'Insert link markup',
                            documentation: 'Creates a clickable text hyperlink',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range
                        }
                    ];

                    return { suggestions };
                }
            });
        }

        editor.onDidScrollChange(event => {
            if (!isScrollSyncEnabled || isScrolling.current || !event.scrollTopChanged) return;
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

    const handlePreviewScroll = useCallback(() => {
        if (!isScrollSyncEnabled || isScrolling.current || !editorRef.current || !previewRef.current) return;

        const preview = previewRef.current;
        const editor = editorRef.current;

        const previewScrollHeight = preview.scrollHeight - preview.clientHeight;
        if (previewScrollHeight <= 0) return;

        const scrollRatio = preview.scrollTop / previewScrollHeight;
        const editorScrollHeight = editor.getScrollHeight() - editor.getLayoutInfo().height;

        isScrolling.current = true;
        editor.setScrollTop(scrollRatio * editorScrollHeight);

        window.setTimeout(() => {
            isScrolling.current = false;
        }, 100);
    }, [isScrollSyncEnabled]);

    const toggleMarkdownCheckbox = useCallback((targetIndex: number) => {
        const editor = editorRef.current;
        if (!editor || !monacoRef.current) return;

        const model = editor.getModel();
        if (!model) return;

        const lines = model.getLinesContent();
        let checkboxCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(\s*([-*+]|\d+\.)\s+\[)([ xX])(\])/);
            if (match) {
                if (checkboxCount === targetIndex) {
                    const currentChar = match[3];
                    const newChar = currentChar === ' ' ? 'x' : ' ';
                    
                    const startCol = match[1].length + 1;
                    const endCol = startCol + 1;
                    
                    const range = new monacoRef.current.Range(i + 1, startCol, i + 1, endCol);
                    
                    editor.executeEdits('checkbox-toggle', [{
                        range,
                        text: newChar
                    }]);
                    
                    showToast(newChar === 'x' ? 'Task completed' : 'Task incomplete');
                    break;
                }
                checkboxCount++;
            }
        }
    }, [showToast]);

    const handlePreviewClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
            const checkbox = target as HTMLInputElement;
            const preview = previewRef.current;
            if (!preview) return;

            const checkboxes = Array.from(preview.querySelectorAll('input[type="checkbox"]'));
            const index = checkboxes.indexOf(checkbox);
            if (index !== -1) {
                // Prevent native checkbox state toggle since we handle it in editor markdown
                event.preventDefault();
                toggleMarkdownCheckbox(index);
            }
        }
    }, [toggleMarkdownCheckbox]);

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
        { id: 'image', type: 'button', label: 'Upload Image/Video', icon: <Image size={18} />, action: toolbarActions.image },
        { id: 'table', type: 'button', label: 'Table', icon: <Table size={18} />, action: toolbarActions.table },
    ];

    const commands: Command[] = [
        { name: 'New Markdown', action: handleNewProject, icon: <FilePlus2 size={20} /> },
        { name: 'Open markdown file', action: () => openFileInputRef.current?.click(), icon: <Upload size={20} /> },
        { name: 'Back to home', action: () => setView('home'), icon: <Home size={20} /> },
        { name: 'Insert table', action: toolbarActions.table, icon: <Table size={20} /> },
        { name: 'Toggle Markdown outline', action: () => setIsOutlineOpen(value => !value), icon: <Outline size={20} /> },
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
                .scrollbar-thin::-webkit-scrollbar { height: 4px; background: transparent; }
                .scrollbar-thin::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 9999px; }
                .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.5); }
                .scrollbar-thin { scrollbar-width: thin; scrollbar-color: hsl(var(--border)) transparent; }
            `}</style>
            <input type="file" ref={openFileInputRef} onChange={handleOpenFile} className="hidden" accept=".md,text/markdown" />
            <input type="file" ref={imageInputRef} onChange={event => handleImageUpload(event.target.files?.[0])} className="hidden" accept="image/*,video/*" />
            <Toast message={toast.message} show={toast.show} />
            
            <TableModal isOpen={isTableModalOpen} onClose={() => setTableModalOpen(false)} onInsert={({ rows, cols }) => insertTableMarkdown(editorRef.current, { rows, cols })} />
            <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} commands={commands} />

            {view === 'home' && (
                <div className="min-h-screen bg-background text-foreground flex flex-col relative select-none">
                    {/* Theme Toggle in Top Right */}
                    <div className="absolute top-6 right-6 z-40">
                        <button
                            onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}
                            className="icon-btn cursor-pointer"
                            title="Toggle theme"
                        >
                            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                        </button>
                    </div>

                    {/* Main Container */}
                    <main className="mx-auto w-full max-w-3xl px-6 py-16 flex-1 flex flex-col">
                        {/* Title Block */}
                        <div className="mb-10 text-center sm:text-left">
                            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Markdown Editor</h1>
                            <p className="mt-2 text-base text-muted-foreground">
                                Local projects, fast Markdown, clean preview.
                            </p>

                            {/* Quick CTAs */}
                            <div className="mt-6 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                <button
                                    onClick={() => openFileInputRef.current?.click()}
                                    className="btn btn-secondary h-9 px-4 gap-2 font-medium cursor-pointer"
                                >
                                    <Upload size={16} />
                                    Import markdown
                                </button>
                                <button
                                    onClick={handleNewProject}
                                    className="btn btn-primary h-9 px-4 gap-2 font-medium cursor-pointer"
                                >
                                    <Plus size={16} />
                                    New blank Markdown
                                </button>
                            </div>
                        </div>

                        {/* Projects Section */}
                        <div className="border-t border-border pt-10 flex-1 flex flex-col">
                            <h2 className="text-xl font-bold tracking-tight mb-4">Projects</h2>

                            {/* Search + Counter */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                                <div className="relative flex-1">
                                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        value={projectSearch}
                                        onChange={event => setProjectSearch(event.target.value)}
                                        placeholder="Search projects..."
                                        className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all font-sans text-foreground"
                                    />
                                </div>
                                <div className="text-xs font-mono text-muted-foreground px-2.5 py-1 shrink-0 bg-muted/50 border border-border rounded-md self-start sm:self-auto">
                                    {filteredProjects.length} of {projects.length}
                                </div>
                            </div>

                            {/* List or Empty State */}
                            <div className="flex-1 flex flex-col">
                                <AnimatePresence mode="wait">
                                    {projects.length === 0 ? (
                                        <motion.div
                                            key="empty"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-xl bg-card/20 px-6"
                                        >
                                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted border border-border">
                                                <FolderOpen size={22} className="text-muted-foreground/60" />
                                            </div>
                                            <h3 className="text-base font-semibold">No projects yet</h3>
                                            <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
                                                Create a blank project or import a Markdown file to keep it available in this browser.
                                            </p>
                                            <button
                                                className="btn btn-primary mt-6 gap-2 font-medium cursor-pointer"
                                                onClick={handleNewProject}
                                            >
                                                <Plus size={16} />
                                                New blank Markdown
                                            </button>
                                        </motion.div>
                                    ) : filteredProjects.length === 0 ? (
                                        <motion.div
                                            key="no-results"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="py-12 text-center text-muted-foreground text-sm border border-border border-dashed rounded-xl"
                                        >
                                            No projects match &ldquo;{projectSearch}&rdquo;
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="list"
                                            layout
                                            className="flex flex-col border border-border rounded-xl bg-card/10 overflow-hidden"
                                        >
                                            {filteredProjects.map((project) => (
                                                <div
                                                    key={project.id}
                                                    onClick={() => openProject(project.id)}
                                                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border bg-card/20 px-4 py-6 hover:bg-muted/30 transition-all duration-150 cursor-pointer first:rounded-t-lg last:rounded-b-lg last:border-b-0"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <FileText size={20} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="truncate font-medium text-foreground text-sm leading-none">
                                                                    {project.name}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    ({formatBytes(new Blob([project.markdown]).size)})
                                                                </span>
                                                            </div>
                                                            <p className="truncate text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                                                {getExcerpt(project.markdown)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0" onClick={event => event.stopPropagation()}>
                                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <Clock3 size={14} />
                                                            {formatRelativeTime(project.updatedAt, clock)}
                                                        </span>

                                                        <div className="flex items-center gap-2 min-w-[110px] justify-end">
                                                            {confirmDeleteId === project.id ? (
                                                                <div className="flex items-center gap-1.5 bg-background border border-border rounded-md px-2 py-1 z-10 shadow-sm animate-in fade-in zoom-in-95 duration-150">
                                                                    <button
                                                                        onClick={() => {
                                                                            setProjects(current => current.filter(item => item.id !== project.id));
                                                                            if (activeProjectId === project.id) {
                                                                                setActiveProjectId(null);
                                                                                setView('home');
                                                                            }
                                                                            setConfirmDeleteId(null);
                                                                            showToast('Project deleted');
                                                                        }}
                                                                        className="text-xs font-semibold text-destructive hover:underline cursor-pointer"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                    <span className="text-muted-foreground text-xs">/</span>
                                                                    <button
                                                                        onClick={() => setConfirmDeleteId(null)}
                                                                        className="text-xs font-medium text-muted-foreground hover:underline cursor-pointer"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleDuplicateProject(project)}
                                                                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                                                                        title="Duplicate project"
                                                                    >
                                                                        <Copy size={15} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setConfirmDeleteId(project.id)}
                                                                        className="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors cursor-pointer"
                                                                        title="Delete project"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block">
                                                                        <path d="m9 18 6-6-6-6"/>
                                                                    </svg>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </main>
                </div>
            )}

            {view === 'editor' && activeProject && (
                <div className="flex h-screen flex-col overflow-hidden">
                    <header className={`flex-shrink-0 border-b border-border bg-background/80 px-6 py-3 backdrop-blur-md select-none ${isZenMode ? 'hidden' : 'block'}`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <button
                                    onClick={() => setView('home')}
                                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm shrink-0 cursor-pointer"
                                    aria-label="Back to projects"
                                >
                                    <ArrowLeft size={16} />
                                    <span className="hidden sm:inline">Projects</span>
                                </button>
                                <span className="text-muted-foreground/40 shrink-0">/</span>
                                <ProjectNameEditor
                                    name={activeProject.name}
                                    onSave={newName => updateActiveProject({ name: newName })}
                                />
                                <button
                                    onClick={() => setIsToolbarVisible(prev => !prev)}
                                    className={`icon-btn shrink-0 cursor-pointer ${isToolbarVisible ? 'text-accent bg-accent/10 border border-accent/20' : 'text-muted-foreground'}`}
                                    title={isToolbarVisible ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                                >
                                    <Sliders size={16} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsCommandPaletteOpen(true)} className="btn btn-secondary h-8 px-3 gap-2 cursor-pointer">
                                    <Search size={14} />
                                    <span className="hidden sm:inline">Search</span>
                                    <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">Ctrl K</kbd>
                                </button>
                                <button onClick={handleCopy} className="icon-btn cursor-pointer" title="Copy markdown"><Copy size={17} /></button>
                                <button onClick={handleDownload} className="btn btn-primary h-8 px-3 gap-2 font-medium cursor-pointer"><FileDown size={15} /> Download</button>
                            </div>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1 overflow-hidden">
                        <PanelGroup direction="horizontal">
                            <Panel defaultSize={50} minSize={isZenMode ? 100 : 24}>
                                <div className="relative flex h-full flex-col bg-background">
                                    {/* Modular formatting toolbar */}
                                    <Toolbar
                                        isVisible={isToolbarVisible}
                                        theme={theme}
                                        onToggleTheme={() => setTheme(value => value === 'light' ? 'dark' : 'light')}
                                        isZenMode={isZenMode}
                                        onToggleZenMode={() => setIsZenMode(!isZenMode)}
                                        isOutlineOpen={isOutlineOpen}
                                        onToggleOutline={() => setIsOutlineOpen(o => {
                                            const next = !o;
                                            if (next) setIsHistoryOpen(false);
                                            return next;
                                        })}
                                        isHistoryOpen={isHistoryOpen}
                                        onToggleHistory={() => setIsHistoryOpen(h => {
                                            const next = !h;
                                            if (next) setIsOutlineOpen(false);
                                            return next;
                                        })}
                                        isScrollSyncEnabled={isScrollSyncEnabled}
                                        onToggleScrollSync={() => setIsScrollSyncEnabled(prev => !prev)}
                                        toolbarItems={toolbarItems}
                                        onOpenFileClick={() => openFileInputRef.current?.click()}
                                    />

                                    {/* Modular Document Outline panel */}
                                    <OutlinePanel
                                        isOpen={isOutlineOpen}
                                        onClose={() => setIsOutlineOpen(false)}
                                        outline={outline}
                                        activeOutlineId={activeOutlineId}
                                        onJump={jumpToOutlineItem}
                                    />

                                    {/* Modular Version Checkpoint history panel */}
                                    <HistoryPanel
                                        isOpen={isHistoryOpen}
                                        onClose={() => setIsHistoryOpen(false)}
                                        versions={activeProject.versions || []}
                                        onSaveCheckpoint={handleCreateCheckpoint}
                                        onDeleteCheckpoint={handleDeleteCheckpoint}
                                        onRestoreCheckpoint={handleRestoreCheckpoint}
                                        formatRelativeTime={val => formatRelativeTime(val, clock)}
                                        formatBytes={formatBytes}
                                    />

                                    <div className={`min-h-0 flex-1 overflow-hidden transition-[padding] ${isOutlineOpen || isHistoryOpen ? 'pl-[19.5rem]' : 'pl-4'} ${isToolbarVisible ? 'pt-16' : 'pt-4'}`}>
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
                                        <div className="relative flex flex-shrink-0 items-center gap-4 border-t border-border bg-muted/50 px-4 py-2 pl-4 text-xs text-muted-foreground overflow-hidden select-none">
                                            <span><Save size={13} className="mr-1 inline" /> Saved {savedLabel}</span>
                                            <span>Lines {stats.lines}</span>
                                            
                                            {/* Interactive Word Goal block */}
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={() => setIsGoalInputOpen(prev => !prev)}
                                                    className="hover:text-accent font-medium transition-colors cursor-pointer select-none"
                                                    title="Set custom writing goal"
                                                >
                                                    Words {stats.words}
                                                    {wordGoal !== null && ` / ${wordGoal}`}
                                                </button>
                                                
                                                <AnimatePresence>
                                                    {isGoalInputOpen && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            className="absolute bottom-full left-0 mb-2 z-50 w-44 rounded-md border border-border bg-card p-2 shadow-lg"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <form
                                                                onSubmit={e => {
                                                                    e.preventDefault();
                                                                    const form = e.currentTarget;
                                                                    const input = form.elements.namedItem('goalVal') as HTMLInputElement;
                                                                    const val = parseInt(input.value, 10);
                                                                    setWordGoal(isNaN(val) || val <= 0 ? null : val);
                                                                    setIsGoalInputOpen(false);
                                                                }}
                                                                className="flex flex-col gap-1.5"
                                                            >
                                                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                                    Target Word Goal
                                                                </label>
                                                                <div className="flex gap-1">
                                                                    <input
                                                                        type="number"
                                                                        name="goalVal"
                                                                        defaultValue={wordGoal ?? ''}
                                                                        placeholder="e.g. 500"
                                                                        className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/40 font-sans text-foreground"
                                                                        autoFocus
                                                                    />
                                                                    <button
                                                                        type="submit"
                                                                        className="btn btn-primary text-xs px-2 h-7 font-semibold"
                                                                    >
                                                                        Set
                                                                    </button>
                                                                </div>
                                                                {wordGoal !== null && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setWordGoal(null);
                                                                            setIsGoalInputOpen(false);
                                                                        }}
                                                                        className="text-[10px] font-semibold text-destructive hover:underline self-start"
                                                                    >
                                                                        Clear Goal
                                                                    </button>
                                                                )}
                                                            </form>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <span>Chars {stats.chars}</span>
                                            <span>•</span>
                                            <span>{stats.readingTime} min read</span>

                                            {/* Writing Goal progress bar */}
                                            {wordGoal !== null && (
                                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-accent/60 to-accent transition-all duration-300 shadow-[0_0_8px_hsl(var(--accent))]"
                                                        style={{ width: `${Math.min(100, (stats.words / wordGoal) * 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Panel>
                            {!isZenMode && <PanelResizeHandle className="w-1.5 bg-border transition hover:bg-primary" />}
                            {!isZenMode && (
                                <Panel defaultSize={50} minSize={24}>
                                    <div className="flex h-full flex-col bg-card">
                                        <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border px-4 text-sm font-medium select-none">
                                            <PanelRight size={16} className="text-muted-foreground" /> Preview
                                        </div>
                                        <div
                                            ref={previewRef}
                                            onScroll={handlePreviewScroll}
                                            onClick={handlePreviewClick}
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
