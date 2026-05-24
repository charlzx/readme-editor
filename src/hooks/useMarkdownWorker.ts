import { useEffect, useRef, useCallback, useState } from 'react';
import type { WorkerRequest, WorkerResponse } from '../workers/markdownWorker';

export function useMarkdownWorker() {
    const workerRef = useRef<Worker | null>(null);
    const callbackRef = useRef<((html: string, error?: string) => void) | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const terminateAndReset = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        setIsProcessing(false);
        callbackRef.current = null;
    }, []);

    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, []);

    const compileMarkdown = useCallback(
        (markdown: string, callback: (html: string, error?: string) => void) => {
            // Instantly abort any active worker to cancel stale compilation tasks
            if (workerRef.current) {
                workerRef.current.terminate();
            }

            setIsProcessing(true);
            callbackRef.current = callback;

            // Spawn a fresh new worker for the latest keystroke
            const worker = new Worker(
                new URL('../workers/markdownWorker.ts', import.meta.url),
                { type: 'module' }
            );
            workerRef.current = worker;

            worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
                const { html, error } = e.data;
                if (callbackRef.current) {
                    callbackRef.current(html, error);
                }
                setIsProcessing(false);
            };

            worker.onerror = (err) => {
                if (callbackRef.current) {
                    callbackRef.current('', err.message || 'Worker compile error');
                }
                setIsProcessing(false);
            };

            const request: WorkerRequest = { markdown };
            worker.postMessage(request);
        },
        []
    );

    return { compileMarkdown, isProcessing, cancel: terminateAndReset };
}
