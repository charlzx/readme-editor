import { useEffect, useState, useRef } from 'react';
import type { FC } from 'react';
import { PencilSimpleIcon as Pencil, CheckIcon as Check, XIcon as Close } from '@phosphor-icons/react';

interface ProjectNameEditorProps {
    name: string;
    onSave: (next: string) => void;
}

export const ProjectNameEditor: FC<ProjectNameEditorProps> = ({ name, onSave }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (editing) {
            setDraft(name);
            window.setTimeout(() => inputRef.current?.select(), 0);
        }
    }, [editing, name]);

    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== name) onSave(trimmed);
        setEditing(false);
    };

    const cancel = () => {
        setDraft(name);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') cancel();
                    }}
                    className="h-8 rounded-md border border-border bg-muted/40 px-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 w-48 transition-all font-sans"
                    aria-label="Project name"
                />
                <button onClick={commit} className="p-1 rounded hover:bg-muted text-accent cursor-pointer" aria-label="Save name">
                    <Check size={16} />
                </button>
                <button onClick={cancel} className="p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer" aria-label="Cancel">
                    <Close size={16} />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors text-left cursor-pointer"
            aria-label="Edit project name"
        >
            <span className="text-base font-semibold tracking-tight text-foreground">{name}</span>
            <Pencil size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
    );
};
