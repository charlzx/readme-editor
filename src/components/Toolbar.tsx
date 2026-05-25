import { useState, useRef, useEffect } from 'react';
import type { FC, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoonIcon as Moon, SunIcon as Sun, ArrowsInIcon as Minimize, ArrowsOutIcon as Maximize, ListMagnifyingGlassIcon as Outline, ClockIcon as Clock3, LinkIcon as Link, UploadSimpleIcon as Upload } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ToolbarItem {
    id: string;
    type: 'button' | 'divider' | 'dropdown';
    label?: string;
    icon?: ReactNode;
    action?: () => void;
    items?: { label: string; action: () => void }[];
}

const DropdownMenu: FC<{ triggerIcon: ReactNode; label: string; children: ReactNode }> = ({ triggerIcon, label, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!isOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (!isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + 8,
                left: Math.min(rect.left, window.innerWidth - 200)
            });
        }
        setIsOpen(prev => !prev);
    };

    return (
        <div className="relative inline-block" ref={containerRef}>
            <button
                ref={buttonRef}
                onClick={handleToggle}
                title={label}
                className={`icon-btn cursor-pointer ${isOpen ? 'bg-accent text-accent-foreground' : ''}`}
            >
                {triggerIcon}
            </button>
            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            style={{
                                position: 'fixed',
                                top: coords.top,
                                left: coords.left,
                            }}
                            className="z-[100] min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm"
                            onClick={() => setIsOpen(false)}
                        >
                            {children}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

interface ToolbarProps {
    isVisible: boolean;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    isZenMode: boolean;
    onToggleZenMode: () => void;
    isOutlineOpen: boolean;
    onToggleOutline: () => void;
    isHistoryOpen: boolean;
    onToggleHistory: () => void;
    isScrollSyncEnabled: boolean;
    onToggleScrollSync: () => void;
    toolbarItems: ToolbarItem[];
    onOpenFileClick: () => void;
}

export const Toolbar: FC<ToolbarProps> = ({
    isVisible,
    theme,
    onToggleTheme,
    isZenMode,
    onToggleZenMode,
    isOutlineOpen,
    onToggleOutline,
    isHistoryOpen,
    onToggleHistory,
    isScrollSyncEnabled,
    onToggleScrollSync,
    toolbarItems,
    onOpenFileClick,
}) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: -10, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    exit={{ opacity: 0, y: -10, x: '-50%' }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute top-3 left-1/2 z-40 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1.5 text-muted-foreground shadow-sm backdrop-blur max-w-[90%] overflow-x-auto whitespace-nowrap scrollbar-thin select-none"
                >
                    <button onClick={onToggleTheme} title="Toggle theme" className="icon-btn cursor-pointer">
                        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                    <button onClick={onToggleZenMode} title={isZenMode ? 'Exit fullscreen' : 'Enter fullscreen'} className="icon-btn cursor-pointer">
                        {isZenMode ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                    
                    <div className="mx-1.5 h-4 w-[1px] bg-border shrink-0" />
                    
                    <button
                        onClick={onToggleOutline}
                        title="Markdown outline"
                        className={`icon-btn cursor-pointer ${isOutlineOpen ? 'bg-accent text-accent-foreground' : ''}`}
                    >
                        <Outline size={18} />
                    </button>
                    
                    <button
                        onClick={onToggleHistory}
                        title="Version history"
                        className={`icon-btn cursor-pointer ${isHistoryOpen ? 'bg-accent text-accent-foreground' : ''}`}
                    >
                        <Clock3 size={18} />
                    </button>
                    
                    <button
                        onClick={onToggleScrollSync}
                        title={isScrollSyncEnabled ? 'Disable Scroll Sync' : 'Enable Scroll Sync'}
                        className={`icon-btn cursor-pointer ${isScrollSyncEnabled ? 'text-accent bg-accent/10 border border-accent/20' : 'text-muted-foreground'}`}
                    >
                        <Link size={18} />
                    </button>
                    
                    <div className="mx-1.5 h-4 w-[1px] bg-border shrink-0" />
                    
                    <div className="flex items-center gap-1">
                        {toolbarItems.map(item => {
                            if (item.type === 'divider') return <div key={item.id} className="mx-1.5 h-4 w-[1px] bg-border shrink-0" />;
                            if (item.type === 'dropdown') {
                                return (
                                    <DropdownMenu key={item.id} triggerIcon={item.icon} label={item.label || ''}>
                                        {item.items?.map(sub => (
                                            <button key={sub.label} onClick={sub.action} className="dropdown-item cursor-pointer text-foreground">{sub.label}</button>
                                        ))}
                                    </DropdownMenu>
                                );
                            }
                            return <button key={item.id} onClick={item.action} title={item.label} className="icon-btn cursor-pointer">{item.icon}</button>;
                        })}
                    </div>
                    
                    <div className="mx-1.5 h-4 w-[1px] bg-border shrink-0" />
                    
                    <button onClick={onOpenFileClick} className="icon-btn cursor-pointer" title="Open file">
                        <Upload size={18} />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
