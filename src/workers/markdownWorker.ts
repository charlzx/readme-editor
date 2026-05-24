import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const markedInstance = new Marked(
    markedHighlight({
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
    })
);

export interface WorkerRequest {
    markdown: string;
}

export interface WorkerResponse {
    html: string;
    error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { markdown } = e.data;
    try {
        const html = await markedInstance.parse(markdown);
        self.postMessage({ html });
    } catch (err) {
        self.postMessage({
            html: '',
            error: err instanceof Error ? err.message : 'Failed to parse markdown',
        });
    }
};
