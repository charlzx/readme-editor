import { useState } from 'react';
import type { FC } from 'react';

interface TableModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: ({ rows, cols }: { rows: number; cols: number }) => void;
}

export const TableModal: FC<TableModalProps> = ({ isOpen, onClose, onInsert }) => {
    const [rows, setRows] = useState(2);
    const [cols, setCols] = useState(3);
    if (!isOpen) return null;

    const updateNumber = (value: string, setter: (value: number) => void) => {
        const next = Number.parseInt(value, 10);
        setter(Number.isNaN(next) ? 1 : Math.max(1, next));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm shadow-xl animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm" onClick={event => event.stopPropagation()}>
                <h3 className="text-lg font-semibold">Insert table</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    <label className="space-y-2 text-sm font-medium flex flex-col text-foreground">
                        Rows
                        <input className="input border border-border bg-background rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/40 font-sans" type="number" min={1} value={rows} onChange={event => updateNumber(event.target.value, setRows)} />
                    </label>
                    <label className="space-y-2 text-sm font-medium flex flex-col text-foreground">
                        Columns
                        <input className="input border border-border bg-background rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/40 font-sans" type="number" min={1} value={cols} onChange={event => updateNumber(event.target.value, setCols)} />
                    </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="btn btn-secondary border border-border bg-muted/20 px-3 py-1.5 rounded-md hover:bg-muted font-medium text-xs cursor-pointer">Cancel</button>
                    <button onClick={() => { onInsert({ rows, cols }); onClose(); }} className="btn btn-primary bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 font-medium text-xs cursor-pointer">Insert</button>
                </div>
            </div>
        </div>
    );
};
