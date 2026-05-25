import { useEffect, useState, useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { MagnifyingGlassIcon as Search } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';

export interface Command {
    name: string;
    action: () => void;
    icon: ReactNode;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    commands: Command[];
}

export const CommandPalette: FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
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
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[12vh] backdrop-blur-sm shadow-xl" onClick={onClose}>
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
                                    className="h-12 w-full bg-transparent pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground text-foreground"
                                    autoFocus
                                />
                            </div>
                            <div className="grid max-h-[52vh] grid-cols-2 gap-1 overflow-y-auto p-2 sm:grid-cols-3 scrollbar-thin">
                                {filteredCommands.map(command => (
                                    <button
                                        key={command.name}
                                        onClick={() => { command.action(); onClose(); }}
                                        className="flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-foreground"
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
