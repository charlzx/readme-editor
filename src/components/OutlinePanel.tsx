import type { FC } from 'react';
import { ListMagnifyingGlassIcon as Outline, XIcon as Close } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';

export interface OutlineItem {
    id: string;
    level: number;
    text: string;
    lineNumber: number;
}

interface OutlinePanelProps {
    isOpen: boolean;
    onClose: () => void;
    outline: OutlineItem[];
    activeOutlineId: string | null;
    onJump: (item: OutlineItem) => void;
}

export const OutlinePanel: FC<OutlinePanelProps> = ({
    isOpen,
    onClose,
    outline,
    activeOutlineId,
    onJump,
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
                            <Outline size={16} className="text-muted-foreground" />
                            Outline
                        </div>
                        <button onClick={onClose} className="icon-btn size-7 cursor-pointer" title="Close outline">
                            <Close size={15} />
                        </button>
                    </div>
                    {outline.length > 0 ? (
                        <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
                            {outline.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => onJump(item)}
                                    className={`block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors ${
                                        activeOutlineId === item.id
                                            ? 'bg-accent text-accent-foreground font-medium'
                                            : 'text-muted-foreground'
                                    }`}
                                    style={{ paddingLeft: `${Math.min(item.level - 1, 4) * 12 + 8}px` }}
                                    title={item.text}
                                >
                                    {item.text}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground select-none">
                            Add headings to build an outline.
                        </div>
                    )}
                </motion.aside>
            )}
        </AnimatePresence>
    );
};
