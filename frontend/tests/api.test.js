import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock XMLHttpRequest — use a shared mutable object so tests can tweak
// status & responseText *after* the XHR is constructed but *before* load fires.
const mockXHR = {
    open: jest.fn(),
    send: jest.fn(),
    upload: { addEventListener: jest.fn() },
    addEventListener: jest.fn(),
    status: 200,
    responseText: '{"ok":true}',
};

// Capture event handlers when they're registered
let uploadProgressHandler = null;
let loadHandler = null;
let errorHandler = null;
let abortHandler = null;

function setupHandlers() {
    uploadProgressHandler = null;
    loadHandler = null;
    errorHandler = null;
    abortHandler = null;

    mockXHR.upload.addEventListener.mockImplementation((event, handler) => {
        if (event === 'progress') uploadProgressHandler = handler;
    });
    mockXHR.addEventListener.mockImplementation((event, handler) => {
        if (event === 'load') loadHandler = handler;
        if (event === 'error') errorHandler = handler;
        if (event === 'abort') abortHandler = handler;
    });
}

// Set up the global mock — constructor resets handlers but NOT status/responseText
global.XMLHttpRequest = jest.fn(() => {
    setupHandlers();
    return mockXHR;
});

// Dynamic import to ensure the mock is set up before the module loads
let api;
beforeAll(async () => {
    const mod = await import('../src/api');
    api = mod.api;
});

beforeEach(() => {
    jest.clearAllMocks();
    mockXHR.status = 200;
    mockXHR.responseText = '{"ok":true}';
    setupHandlers();
});

describe('api.upload', () => {
    test('resolves with parsed JSON on success (2xx)', async () => {
        mockXHR.status = 200;
        mockXHR.responseText = '{"id":"abc","sharePath":"/d/abc"}';

        const formData = new FormData();
        const promise = api.upload(formData);

        // Simulate successful response
        loadHandler();

        const result = await promise;
        expect(result).toEqual({ id: 'abc', sharePath: '/d/abc' });
        expect(mockXHR.open).toHaveBeenCalledWith('POST', '/api/upload');
        expect(mockXHR.send).toHaveBeenCalledWith(formData);
    });

    test('rejects with error message on non-2xx response', async () => {
        mockXHR.status = 400;
        mockXHR.responseText = '{"error":"No files provided"}';

        const promise = api.upload(new FormData());
        loadHandler();

        await expect(promise).rejects.toThrow('No files provided');
    });

    test('rejects with default message when error field is missing', async () => {
        mockXHR.status = 500;
        mockXHR.responseText = '{}';

        const promise = api.upload(new FormData());
        loadHandler();

        await expect(promise).rejects.toThrow('Upload failed');
    });

    test('rejects with joined errors array on validation failure', async () => {
        mockXHR.status = 422;
        mockXHR.responseText = '{"errors":["File too large","Invalid type"]}';

        const promise = api.upload(new FormData());
        loadHandler();

        await expect(promise).rejects.toThrow('File too large, Invalid type');
    });

    test('rejects on network error', async () => {
        const promise = api.upload(new FormData());
        errorHandler();

        await expect(promise).rejects.toThrow('Network error');
    });

    test('rejects on abort', async () => {
        const promise = api.upload(new FormData());
        abortHandler();

        await expect(promise).rejects.toThrow('Upload cancelled');
    });

    test('rejects when responseText is invalid JSON', async () => {
        mockXHR.status = 200;
        mockXHR.responseText = 'not json{{{';

        const promise = api.upload(new FormData());
        loadHandler();

        await expect(promise).rejects.toThrow('Invalid response from server');
    });

    test('calls onProgress with loaded and total when lengthComputable', () => {
        const onProgress = jest.fn();
        api.upload(new FormData(), onProgress);

        // Simulate a progress event
        uploadProgressHandler({ lengthComputable: true, loaded: 512000, total: 1024000 });

        expect(onProgress).toHaveBeenCalledWith(512000, 1024000);
    });

    test('does not call onProgress when lengthComputable is false', () => {
        const onProgress = jest.fn();
        api.upload(new FormData(), onProgress);

        uploadProgressHandler({ lengthComputable: false, loaded: 100, total: 200 });

        expect(onProgress).not.toHaveBeenCalled();
    });

    test('does not throw when onProgress is not provided', () => {
        expect(() => {
            api.upload(new FormData());
            uploadProgressHandler({ lengthComputable: true, loaded: 50, total: 100 });
        }).not.toThrow();
    });

    test('calls onProgress multiple times for sequential progress events', () => {
        const onProgress = jest.fn();
        api.upload(new FormData(), onProgress);

        uploadProgressHandler({ lengthComputable: true, loaded: 256000, total: 1024000 });
        uploadProgressHandler({ lengthComputable: true, loaded: 512000, total: 1024000 });
        uploadProgressHandler({ lengthComputable: true, loaded: 1024000, total: 1024000 });

        expect(onProgress).toHaveBeenCalledTimes(3);
        expect(onProgress).toHaveBeenNthCalledWith(1, 256000, 1024000);
        expect(onProgress).toHaveBeenNthCalledWith(2, 512000, 1024000);
        expect(onProgress).toHaveBeenNthCalledWith(3, 1024000, 1024000);
    });
});
