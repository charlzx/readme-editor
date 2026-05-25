import type { FC } from 'react';
import { ClockIcon as Clock3, XIcon as Close, TrashIcon as Trash2 } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ReadmeVersion {
    id: string;
    timestamp: string;
    name: string;
    markdown: string;
    size: number;
}

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    versions: ReadmeVersion[];
    onSaveCheckpoint: (name: string) => void;
    onDeleteCheckpoint: (id: string) => void;
    onRestoreCheckpoint: (version: ReadmeVersion) => void;
    formatRelativeTime: (val: string) => string;
    formatBytes: (bytes: number) => string;
}

export const HistoryPanel: FC<HistoryPanelProps> = ({
    isOpen,
    onClose,
    versions,
    onSaveCheckpoint,
    onDeleteCheckpoint,
    onRestoreCheckpoint,
    formatRelativeTime,
    formatBytes,
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.aside
                    className="absolute bottom-3 left-3 top-3 z-30 flex w-72 flex-col rounded-lg border border-border bg-card/95 text-card-foreground shadow-sm backdrop-blur"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                    <div className="flex h-11 items-center justify-between border-b border-border px-3 select-none">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Clock3 size={16} className="text-muted-foreground" />
                            Version History
                        </div>
                        <button onClick={onClose} className="icon-btn size-7 cursor-pointer" title="Close history">
                            <Close size={15} />
                        </button>
                    </div>

                    {/* Manual Checkpoint Creator */}
                    <div className="p-3 border-b border-border bg-muted/30">
                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                const form = e.currentTarget;
                                const input = form.elements.namedItem('versionName') as HTMLInputElement;
                                const name = input.value.trim();
                                onSaveCheckpoint(name || '');
                                form.reset();
                            }}
                            className="flex gap-1.5"
                        >
                            <input
                                type="text"
                                name="versionName"
                                placeholder="Snapshot name..."
                                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/40 transition-all font-sans text-foreground"
                            />
                            <button
                                type="submit"
                                className="btn btn-primary text-xs px-2.5 h-8 font-semibold shrink-0 cursor-pointer"
                            >
                                Save
                            </button>
                        </form>
                    </div>

                    {/* Checkpoints List */}
                    <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
                        {versions && versions.length > 0 ? (
                            versions.map(version => (
                                <div
                                    key={version.id}
                                    className="group relative flex flex-col gap-1 rounded-md border border-border bg-card/50 p-2.5 hover:bg-accent/40 hover:border-accent/40 transition-all duration-150"
                                >
                                    <div className="flex items-start justify-between gap-2 pr-6">
                                        <span className="font-semibold text-xs text-foreground leading-tight truncate" title={version.name}>
                                            {version.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                                        <span>{formatRelativeTime(version.timestamp)}</span>
                                        <span>•</span>
                                        <span>{formatBytes(version.size)}</span>
                                    </div>

                                    {/* Restore Button */}
                                    <div className="mt-1.5 flex items-center justify-between">
                                        <button
                                            onClick={() => onRestoreCheckpoint(version)}
                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline cursor-pointer"
                                        >
                                            Restore
                                        </button>
                                    </div>

                                    {/* Delete Button inside hover group */}
                                    <button
                                        onClick={() => onDeleteCheckpoint(version.id)}
                                        className="absolute top-2 right-2 p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer"
                                        title="Delete version"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="flex h-32 flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground select-none">
                                No checkpoints saved yet.
                                <p className="mt-1 text-[10px] text-muted-foreground/60 leading-relaxed max-w-[200px]">
                                    Snapshots are saved automatically every 10 minutes when changes are made.
                                </p>
                            </div>
                        )}
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
};
