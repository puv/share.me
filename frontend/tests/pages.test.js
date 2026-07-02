import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock the API module
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
    const actual = jest.requireActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

jest.mock('../src/api', () => ({
    api: {
        upload: jest.fn(),
        getUpload: jest.fn(),
        updateUpload: jest.fn(),
        verifyPassword: jest.fn(),
        deleteUpload: jest.fn(),
        adminLogin: jest.fn(),
        adminLogout: jest.fn(),
        adminCheck: jest.fn(),
        adminStats: jest.fn(),
        adminUploads: jest.fn(),
        adminDeleteUpload: jest.fn(),
        adminGetSettings: jest.fn(),
        adminUpdateSettings: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        getMe: jest.fn(),
    },
    fileDownloadUrl: (id) => '/api/file/' + id,
    zipDownloadUrl: (id) => '/api/upload/' + id + '/zip',
    qrDownloadUrl: (id) => '/api/upload/' + id + '/qr',
}));

// Mock AuthContext — default to guest
const mockUseAuth = jest.fn(() => ({
    user: null,
    loading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    getToken: jest.fn(() => null),
}));

jest.mock('../src/context/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
    AuthProvider: ({ children }) => children,
}));

import { api } from '../src/api';
import UploadPage from '../src/pages/UploadPage';
import DownloadPage from '../src/pages/DownloadPage';
import AdminPage from '../src/pages/AdminPage';
import LoginPage from '../src/pages/LoginPage';
import RegisterPage from '../src/pages/RegisterPage';

function renderWithRouter(ui, { route = '/' } = {}) {
    window.history.pushState({}, 'Test page', route);
    return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    global.fetch = undefined;
});

describe('UploadPage', () => {
    test('renders the drop zone centered on page', () => {
        renderWithRouter(<UploadPage />);
        expect(screen.getByText(/Click to browse/)).toBeInTheDocument();
        expect(screen.getByText(/50 MB limit/)).toBeInTheDocument();
    });

    test('shows login and register links for guest users', () => {
        renderWithRouter(<UploadPage />);
        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('Register')).toBeInTheDocument();
    });

    test('clicking Login link does not trigger file upload dialog', () => {
        renderWithRouter(<UploadPage />);
        fireEvent.click(screen.getByText('Login'));
        expect(screen.queryByRole('button', { name: /Upload/i })).not.toBeInTheDocument();
    });

    test('clicking Register link does not trigger file upload dialog', () => {
        renderWithRouter(<UploadPage />);
        fireEvent.click(screen.getByText('Register'));
        expect(screen.queryByRole('button', { name: /Upload/i })).not.toBeInTheDocument();
    });

    test('does not show upload button when no files selected', () => {
        renderWithRouter(<UploadPage />);
        expect(screen.queryByRole('button', { name: /Upload/i })).not.toBeInTheDocument();
    });

    test('shows file list and upload button when files are added', async () => {
        renderWithRouter(<UploadPage />);
        const file = new File(['content'], 'test.txt', { type: 'text/plain' });
        const input = document.querySelector('input[type="file"]');
        await userEvent.upload(input, file);

        expect(screen.getByText('test.txt')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Upload 1 file/i })).toBeInTheDocument();
    });

    test('can add multiple files', async () => {
        renderWithRouter(<UploadPage />);
        const file1 = new File(['a'], 'a.txt', { type: 'text/plain' });
        const file2 = new File(['b'], 'b.txt', { type: 'text/plain' });
        const input = document.querySelector('input[type="file"]');
        await userEvent.upload(input, [file1, file2]);

        expect(screen.getByText('a.txt')).toBeInTheDocument();
        expect(screen.getByText('b.txt')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Upload 2 files/i })).toBeInTheDocument();
    });

    test('can remove a file from the list', async () => {
        renderWithRouter(<UploadPage />);
        const file = new File(['content'], 'remove-me.txt', { type: 'text/plain' });
        const input = document.querySelector('input[type="file"]');
        await userEvent.upload(input, file);

        expect(screen.getByText('remove-me.txt')).toBeInTheDocument();

        const removeBtn = screen.getByLabelText('Remove file');
        fireEvent.click(removeBtn);

        expect(screen.queryByText('remove-me.txt')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Upload/i })).not.toBeInTheDocument();
    });

    test('shows error when upload fails', async () => {
        api.upload.mockRejectedValue(new Error('Upload failed: Server error'));
        renderWithRouter(<UploadPage />);

        const file = new File(['test'], 'test.txt', { type: 'text/plain' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            expect(screen.getByText(/Server error/)).toBeInTheDocument();
        });
    });

    test('navigates to share page on successful upload', async () => {
        api.upload.mockResolvedValue({
            id: 'A7kP',
            sharePath: '/d/A7kP',
        });
        renderWithRouter(<UploadPage />);

        const file = new File(['test'], 'test.txt', { type: 'text/plain' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            expect(api.upload).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith('/d/A7kP');
        });
    });

    test('drag and drop adds files', () => {
        renderWithRouter(<UploadPage />);
        const dropZone = document.querySelector('.drop-zone');

        const file = new File(['drag content'], 'drag.txt', { type: 'text/plain' });
        fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

        expect(screen.getByText('drag.txt')).toBeInTheDocument();
    });

    test('shows progress bar with percentage during upload', async () => {
        // Mock upload to call onProgress then never resolve (stay in "uploading" state)
        api.upload.mockImplementation((_formData, onProgress) => {
            if (onProgress) onProgress(500000, 1000000); // 50%
            return new Promise(() => { }); // never settles — stays uploading
        });

        renderWithRouter(<UploadPage />);
        const file = new File(['x'.repeat(1000000)], 'big.bin', { type: 'application/octet-stream' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            expect(screen.getByText('Uploading 50%')).toBeInTheDocument();
        });
    });

    test('shows upload speed in MB/s after brief delay', async () => {
        api.upload.mockImplementation((_formData, onProgress) => {
            // Simulate progress after 150ms (past the 100ms guard in the component)
            setTimeout(() => {
                if (onProgress) onProgress(2000000, 4000000);
            }, 150);
            return new Promise(() => { });
        });

        renderWithRouter(<UploadPage />);
        const file = new File(['x'.repeat(100)], 'fast.bin', { type: 'application/octet-stream' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        // Speed appears after the timeout fires (elapsed > 0.1s guard in component)
        await waitFor(() => {
            const speedEl = document.querySelector('.upload-progress-speed');
            expect(speedEl).toBeInTheDocument();
            expect(speedEl.textContent).toMatch(/\d+\.\d{2} MB\/s/);
        }, { timeout: 1000 });
    });

    test('progress bar fill width matches percentage', async () => {
        api.upload.mockImplementation((_formData, onProgress) => {
            if (onProgress) onProgress(750, 1000); // 75%
            return new Promise(() => { });
        });

        renderWithRouter(<UploadPage />);
        const file = new File(['x'.repeat(100)], 'pct.bin', { type: 'application/octet-stream' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            const fill = document.querySelector('.upload-progress-fill');
            expect(fill).toBeInTheDocument();
            expect(fill.style.width).toBe('75%');
        });
    });

    test('does not show progress bar before upload starts', () => {
        renderWithRouter(<UploadPage />);
        expect(document.querySelector('.upload-progress')).not.toBeInTheDocument();
    });

    test('progress bar disappears and state resets on upload error', async () => {
        api.upload.mockRejectedValue(new Error('Upload failed: Server error'));
        renderWithRouter(<UploadPage />);

        const file = new File(['test'], 'fail.txt', { type: 'text/plain' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            expect(screen.getByText(/Server error/)).toBeInTheDocument();
        });

        // Progress bar should be gone after error
        expect(document.querySelector('.upload-progress')).not.toBeInTheDocument();
        // Upload button should be re-enabled
        expect(screen.getByRole('button', { name: /Upload 1 file/i })).not.toBeDisabled();
    });

    test('button shows Uploading... text and is disabled during upload', async () => {
        api.upload.mockImplementation(() => new Promise(() => { })); // never resolves

        renderWithRouter(<UploadPage />);
        const file = new File(['test'], 'wait.txt', { type: 'text/plain' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /Uploading/ });
            expect(btn).toBeDisabled();
        });
    });

    test('shows user bar and 1 GB limit when logged in', () => {
        mockUseAuth.mockReturnValue({
            user: { id: 'u1', username: 'john', maxUploadSize: 1073741824 },
            loading: false,
            login: jest.fn(),
            register: jest.fn(),
            logout: jest.fn(),
            getToken: jest.fn(() => 'fake-token'),
        });

        renderWithRouter(<UploadPage />);
        const userElements = screen.getAllByText('john');
        expect(userElements.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/1 GB limit/)).toBeInTheDocument();
        expect(screen.queryByText('Login')).not.toBeInTheDocument();
    });

    test('rejects upload exceeding guest 50 MB limit', async () => {
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: jest.fn(), register: jest.fn(), logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<UploadPage />);
        const bigFile = new File(['x'], 'huge.bin', { type: 'application/octet-stream' });
        Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });
        await userEvent.upload(document.querySelector('input[type="file"]'), bigFile);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            expect(screen.getByText(/exceeds the 50 MB upload limit/)).toBeInTheDocument();
        });
    });

    test('logout button calls logout', () => {
        const mockLogout = jest.fn();
        mockUseAuth.mockReturnValue({
            user: { id: 'u1', username: 'john', maxUploadSize: 1073741824 },
            loading: false,
            login: jest.fn(), register: jest.fn(), logout: mockLogout,
            getToken: jest.fn(() => 'fake-token'),
        });

        renderWithRouter(<UploadPage />);
        fireEvent.click(screen.getByTitle('Logout'));
        expect(mockLogout).toHaveBeenCalledTimes(1);
    });
});

describe('DownloadPage - Viewer (non-owner)', () => {
    test('shows loading state initially', () => {
        api.getUpload.mockReturnValue(new Promise(() => { }));
        renderWithRouter(<DownloadPage />, { route: '/d/test123' });
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('shows error for not found', async () => {
        api.getUpload.mockRejectedValue(new Error('Upload not found or expired'));
        renderWithRouter(<DownloadPage />, { route: '/d/missing' });
        await waitFor(() => {
            expect(screen.getByText('Not Available')).toBeInTheDocument();
        });
    });

    test('shows file list with download buttons', async () => {
        api.getUpload.mockResolvedValue({
            id: 'Xy9Z',
            hasPassword: false,
            isOwner: false,
            created_at: new Date().toISOString(),
            retention_type: 'permanent',
            download_count: 0,
            files: [
                { id: 'f1', original_name: 'doc.pdf', size: 2048 },
                { id: 'f2', original_name: 'img.png', size: 4096 },
            ],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/Xy9Z' });
        await waitFor(() => {
            expect(screen.getByText('doc.pdf')).toBeInTheDocument();
            expect(screen.getByText('img.png')).toBeInTheDocument();
            expect(screen.getByText('Download All as ZIP')).toBeInTheDocument();
        });

        // Should have individual download links
        const downloadLinks = screen.getAllByText('Download');
        expect(downloadLinks.length).toBe(2);
    });

    test('shows file stats', async () => {
        api.getUpload.mockResolvedValue({
            id: 'Xy9Z',
            hasPassword: false,
            isOwner: false,
            created_at: new Date().toISOString(),
            retention_type: 'permanent',
            download_count: 5,
            files: [{ id: 'f1', original_name: 'doc.txt', size: 1024 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/Xy9Z' });
        await waitFor(() => {
            expect(screen.getByText('1 file')).toBeInTheDocument();
            expect(screen.getByText('5 downloads')).toBeInTheDocument();
        });
    });

    test('does NOT show settings box for non-owner', async () => {
        api.getUpload.mockResolvedValue({
            id: 'Xy9Z',
            hasPassword: false,
            isOwner: false,
            files: [{ id: 'f1', original_name: 'doc.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/Xy9Z' });
        await waitFor(() => {
            expect(screen.getByText('doc.txt')).toBeInTheDocument();
        });
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
        expect(screen.queryByText('Save Settings')).not.toBeInTheDocument();
    });

    test('ZIP download visible only for multi-file uploads', async () => {
        api.getUpload.mockResolvedValue({
            id: 'Xy9Z',
            hasPassword: false,
            isOwner: false,
            files: [{ id: 'f1', original_name: 'single.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/Xy9Z' });
        await waitFor(() => {
            expect(screen.getByText('single.txt')).toBeInTheDocument();
        });
        expect(screen.queryByText('Download All as ZIP')).not.toBeInTheDocument();
    });
});

describe('DownloadPage - Owner', () => {
    test('shows settings box for owner', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'myfile.txt', size: 500 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Settings')).toBeInTheDocument();
            expect(screen.getByText('Save Settings')).toBeInTheDocument();
            expect(screen.getByText('Delete Upload')).toBeInTheDocument();
        });
    });

    test('shows retention selector with value input', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'days',
            retention_value: 7,
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Settings')).toBeInTheDocument();
        });

        // Should have a select with days selected
        const select = screen.getByRole('combobox');
        expect(select.value).toBe('days');

        // Should have value input since days is time-based
        expect(screen.getByPlaceholderText('Value')).toBeInTheDocument();
    });

    test('can save settings', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });
        api.updateUpload.mockResolvedValue({ success: true });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Save Settings')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Save Settings'));

        await waitFor(() => {
            expect(api.updateUpload).toHaveBeenCalled();
            expect(screen.getByText('Settings updated')).toBeInTheDocument();
        });
    });

    test('shares link copy button', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Share link')).toBeInTheDocument();
        });
    });

    test('delete button works for owner', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });
        api.deleteUpload.mockResolvedValue({ success: true });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Delete Upload')).toBeInTheDocument();
        });

        window.confirm = jest.fn(() => true);
        fireEvent.click(screen.getByText('Delete Upload'));

        await waitFor(() => {
            expect(api.deleteUpload).toHaveBeenCalled();
            expect(screen.getByText('Upload Deleted')).toBeInTheDocument();
        });
    });

    test('QR button is visible next to share link for owner', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Share link')).toBeInTheDocument();
        });

        // The QR button has title "Show QR Code"
        expect(screen.getByTitle('Show QR Code')).toBeInTheDocument();
    });

    test('clicking QR button opens dialog and fetches QR image', async () => {
        // Mock fetch for QR code endpoint
        const mockBlob = new Blob(['fake-png-data'], { type: 'image/png' });
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: true, blob: () => Promise.resolve(mockBlob) })
        );

        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByTitle('Show QR Code')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTitle('Show QR Code'));

        await waitFor(() => {
            // Dialog heading should appear
            expect(screen.getByText('QR Code')).toBeInTheDocument();
        });

        // Should show the QR image after fetch completes
        await waitFor(() => {
            const img = document.querySelector('.qr-modal-image img');
            expect(img).toBeInTheDocument();
            expect(img.alt).toBe('QR Code for share link');
        });

        // Download PNG link should be present
        expect(screen.getByText('Download PNG')).toBeInTheDocument();
    });

    test('closing QR dialog by clicking overlay', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['data'])) })
        );

        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByTitle('Show QR Code')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTitle('Show QR Code'));

        await waitFor(() => {
            expect(screen.getByText('QR Code')).toBeInTheDocument();
        });

        // Click the overlay (backdrop)
        fireEvent.click(document.querySelector('.modal-overlay'));

        await waitFor(() => {
            expect(screen.queryByText('QR Code')).not.toBeInTheDocument();
        });
    });

    test('closing QR dialog by clicking X button', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['data'])) })
        );

        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByTitle('Show QR Code')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTitle('Show QR Code'));

        await waitFor(() => {
            expect(screen.getByText('QR Code')).toBeInTheDocument();
        });

        // Click the X close button
        fireEvent.click(screen.getByLabelText('Close QR dialog'));

        await waitFor(() => {
            expect(screen.queryByText('QR Code')).not.toBeInTheDocument();
        });
    });

    test('QR dialog reuses cached image on second open', async () => {
        const fetchMock = jest.fn(() =>
            Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['data'])) })
        );
        global.fetch = fetchMock;

        // Mock FileReader to fire onload synchronously so qrDataUrl gets set
        const origFileReader = global.FileReader;
        global.FileReader = function () {
            this.readAsDataURL = function (blob) {
                this.result = 'data:image/png;base64,fake';
                if (this.onload) this.onload();
            };
        };

        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByTitle('Show QR Code')).toBeInTheDocument();
        });

        // Open first time
        fireEvent.click(screen.getByTitle('Show QR Code'));
        await waitFor(() => {
            expect(screen.getByText('QR Code')).toBeInTheDocument();
        });

        // Close
        fireEvent.click(screen.getByLabelText('Close QR dialog'));
        await waitFor(() => {
            expect(screen.queryByText('QR Code')).not.toBeInTheDocument();
        });

        // Open second time
        fireEvent.click(screen.getByTitle('Show QR Code'));
        await waitFor(() => {
            expect(screen.getByText('QR Code')).toBeInTheDocument();
        });

        // fetch should only have been called once (image is cached)
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Restore original FileReader
        global.FileReader = origFileReader;
    });
});

describe('Network Errors', () => {
    test('upload shows network error message', async () => {
        // Simulate a fetch network failure
        api.upload.mockRejectedValue(new Error('Network error — server may be unavailable'));
        renderWithRouter(<UploadPage />);

        const file = new File(['test'], 'test.txt', { type: 'text/plain' });
        await userEvent.upload(document.querySelector('input[type="file"]'), file);
        fireEvent.click(screen.getByRole('button', { name: /Upload 1 file/i }));

        await waitFor(() => {
            expect(screen.getByText(/Network error/)).toBeInTheDocument();
        });
    });

    test('download page shows network error', async () => {
        api.getUpload.mockRejectedValue(new Error('Network error — server may be unavailable'));
        renderWithRouter(<DownloadPage />, { route: '/d/test' });

        await waitFor(() => {
            expect(screen.getByText(/Network error/)).toBeInTheDocument();
        });
    });

    test('password verify shows network error', async () => {
        api.getUpload.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            files: [],
        });
        api.verifyPassword.mockRejectedValue(new Error('Network error — server may be unavailable'));

        renderWithRouter(<DownloadPage />, { route: '/d/secret1' });
        await waitFor(() => {
            expect(screen.getByText('Password Required')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'pass' } });
        fireEvent.click(screen.getByText('Unlock'));

        await waitFor(() => {
            expect(screen.getByText(/Network error/)).toBeInTheDocument();
        });
    });

    test('owner save settings shows network error', async () => {
        api.getUpload.mockResolvedValue({
            id: 'A7kP',
            hasPassword: false,
            isOwner: true,
            retention_type: 'permanent',
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'f.txt', size: 100 }],
        });
        api.updateUpload.mockRejectedValue(new Error('Network error — server may be unavailable'));

        renderWithRouter(<DownloadPage />, { route: '/d/A7kP' });
        await waitFor(() => {
            expect(screen.getByText('Save Settings')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Save Settings'));

        await waitFor(() => {
            expect(screen.getByText(/Network error/)).toBeInTheDocument();
        });
    });

    test('admin login shows network error', async () => {
        const mockLogin = jest.fn().mockRejectedValue(new Error('Network error — server may be unavailable'));
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: mockLogin, register: jest.fn(), logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<LoginPage />, { route: '/login' });
        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'admin' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass' } });
        fireEvent.click(screen.getByText('Sign In'));

        await waitFor(() => {
            expect(screen.getByText(/Network error/)).toBeInTheDocument();
        });
    });
});

describe('DownloadPage - Password Protected', () => {
    test('shows password prompt', async () => {
        api.getUpload.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            files: [],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/secret1' });
        await waitFor(() => {
            expect(screen.getByText('Password Required')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
        });
    });

    test('wrong password shows error', async () => {
        api.getUpload.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            files: [],
        });
        api.verifyPassword.mockRejectedValue(new Error('Incorrect password'));

        renderWithRouter(<DownloadPage />, { route: '/d/secret1' });
        await waitFor(() => {
            expect(screen.getByText('Password Required')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByText('Unlock'));

        await waitFor(() => {
            expect(screen.getByText('Incorrect password')).toBeInTheDocument();
        });
    });

    test('correct password reveals files', async () => {
        api.getUpload.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            files: [],
        });
        api.verifyPassword.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            isOwner: false,
            created_at: new Date().toISOString(),
            retention_type: 'permanent',
            download_count: 0,
            files: [{ id: 'f1', original_name: 'secret.pdf', size: 1024 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/secret1' });
        await waitFor(() => {
            expect(screen.getByText('Password Required')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'correct' } });
        fireEvent.click(screen.getByText('Unlock'));

        await waitFor(() => {
            expect(screen.getByText('secret.pdf')).toBeInTheDocument();
        });
    });

    test('correct password as owner shows settings too', async () => {
        api.getUpload.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            files: [],
        });
        api.verifyPassword.mockResolvedValue({
            id: 'secret1',
            hasPassword: true,
            isOwner: true,
            created_at: new Date().toISOString(),
            retention_type: 'permanent',
            retention_value: null,
            alias: null,
            download_count: 0,
            files: [{ id: 'f1', original_name: 'secret.pdf', size: 1024 }],
        });

        renderWithRouter(<DownloadPage />, { route: '/d/secret1' });
        await waitFor(() => {
            expect(screen.getByText('Password Required')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'correct' } });
        fireEvent.click(screen.getByText('Unlock'));

        await waitFor(() => {
            expect(screen.getByText('secret.pdf')).toBeInTheDocument();
            expect(screen.getByText('Settings')).toBeInTheDocument();
            expect(screen.getByText('Save Settings')).toBeInTheDocument();
        });
    });
});

describe('AdminPage', () => {
    test('redirects to login when not authenticated', async () => {
        api.adminCheck.mockRejectedValue(new Error('Unauthorized'));
        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => {
            expect(api.adminCheck).toHaveBeenCalled();
        });
    });

    test('shows dashboard when authenticated', async () => {
        api.adminCheck.mockResolvedValue({ isAdmin: true });
        api.adminStats.mockResolvedValue({
            totalUploads: 10,
            activeUploads: 8,
            expiredUploads: 2,
            storageUsed: 1048576,
            totalDownloads: 25,
        });
        api.adminUploads.mockResolvedValue({ uploads: [], total: 10 });

        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => {
            expect(screen.getByText('Admin Panel')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByText('10')).toBeInTheDocument();
            expect(screen.getByText('Total Uploads')).toBeInTheDocument();
        });
    });

    test('can logout', async () => {
        api.adminCheck.mockResolvedValue({ isAdmin: true });
        api.adminStats.mockResolvedValue({
            totalUploads: 0, activeUploads: 0, expiredUploads: 0,
            storageUsed: 0, totalDownloads: 0,
        });
        api.adminUploads.mockResolvedValue({ uploads: [], total: 0 });
        api.adminLogout.mockResolvedValue({ success: true });

        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => {
            expect(screen.getByText('Admin Panel')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Logout'));
        await waitFor(() => {
            expect(api.adminLogout).toHaveBeenCalled();
        });
    });

    test('settings tab shows tiered upload size and retention fields', async () => {
        api.adminCheck.mockResolvedValue({ isAdmin: true });
        api.adminStats.mockResolvedValue({ totalUploads: 0, activeUploads: 0, expiredUploads: 0, storageUsed: 0, totalDownloads: 0 });
        api.adminUploads.mockResolvedValue({ uploads: [], total: 0 });
        api.adminGetSettings.mockResolvedValue({
            guest_max_upload_size: '52428800',
            user_max_upload_size: '1073741824',
            guest_max_retention: 'permanent',
            user_max_retention: 'permanent',
            max_single_file_size: '1073741824',
            max_total_upload_size: '5368709120',
            cleanup_interval_minutes: '60',
        });

        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => {
            expect(screen.getByText('Admin Panel')).toBeInTheDocument();
        });

        // Switch to settings tab
        fireEvent.click(screen.getByText('Settings'));

        await waitFor(() => {
            expect(screen.getByText('Guest Max Upload Size')).toBeInTheDocument();
            expect(screen.getByText('User Max Upload Size')).toBeInTheDocument();
            expect(screen.getByText('Guest Max Retention')).toBeInTheDocument();
            expect(screen.getByText('User Max Retention')).toBeInTheDocument();
        });
    });

    test('guest upload size has MB/GB unit dropdown', async () => {
        api.adminCheck.mockResolvedValue({ isAdmin: true });
        api.adminStats.mockResolvedValue({ totalUploads: 0, activeUploads: 0, expiredUploads: 0, storageUsed: 0, totalDownloads: 0 });
        api.adminUploads.mockResolvedValue({ uploads: [], total: 0 });
        api.adminGetSettings.mockResolvedValue({
            guest_max_upload_size: '52428800',
            user_max_upload_size: '1073741824',
            guest_max_retention: 'permanent',
            user_max_retention: 'permanent',
        });

        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => expect(screen.getByText('Admin Panel')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Settings'));

        await waitFor(() => {
            // Two MB/GB selects (guest + user)
            const unitSelects = document.querySelectorAll('select[name="guest_size_unit"], select[name="user_size_unit"]');
            expect(unitSelects.length).toBe(2);
            for (const select of unitSelects) {
                expect(select.querySelector('option[value="MB"]')).toBeInTheDocument();
                expect(select.querySelector('option[value="GB"]')).toBeInTheDocument();
            }
        });
    });

    test('guest and user retention are dropdown selects', async () => {
        api.adminCheck.mockResolvedValue({ isAdmin: true });
        api.adminStats.mockResolvedValue({ totalUploads: 0, activeUploads: 0, expiredUploads: 0, storageUsed: 0, totalDownloads: 0 });
        api.adminUploads.mockResolvedValue({ uploads: [], total: 0 });
        api.adminGetSettings.mockResolvedValue({
            guest_max_upload_size: '52428800',
            user_max_upload_size: '1073741824',
            guest_max_retention: 'days',
            user_max_retention: 'weeks',
        });

        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => expect(screen.getByText('Admin Panel')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Settings'));

        await waitFor(() => {
            expect(screen.getByText('Guest Max Retention')).toBeInTheDocument();
        });

        // Guest retention should default to 'days'
        const selects = document.querySelectorAll('select');
        const retentionSelects = Array.from(selects).filter(s =>
            s.querySelector('option[value="one_download"]')
        );
        expect(retentionSelects.length).toBe(2); // guest + user
    });

    test('can save tiered settings', async () => {
        api.adminCheck.mockResolvedValue({ isAdmin: true });
        api.adminStats.mockResolvedValue({ totalUploads: 0, activeUploads: 0, expiredUploads: 0, storageUsed: 0, totalDownloads: 0 });
        api.adminUploads.mockResolvedValue({ uploads: [], total: 0 });
        api.adminGetSettings.mockResolvedValue({
            guest_max_upload_size: '52428800',
            user_max_upload_size: '1073741824',
            guest_max_retention: 'permanent',
            user_max_retention: 'permanent',
        });
        api.adminUpdateSettings.mockResolvedValue({ success: true });

        renderWithRouter(<AdminPage />, { route: '/admin' });
        await waitFor(() => expect(screen.getByText('Admin Panel')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Settings'));

        await waitFor(() => {
            expect(screen.getByText('Guest Max Retention')).toBeInTheDocument();
        });

        // Submit the form directly
        const form = document.querySelector('form');
        fireEvent.submit(form);

        await waitFor(() => {
            expect(api.adminUpdateSettings).toHaveBeenCalled();
        });

        // Verify the call includes tiered keys
        const callArgs = api.adminUpdateSettings.mock.calls[0][0];
        expect(callArgs).toHaveProperty('guest_max_upload_size');
        expect(callArgs).toHaveProperty('user_max_upload_size');
        expect(callArgs).toHaveProperty('guest_max_retention');
        expect(callArgs).toHaveProperty('user_max_retention');
    });
});

describe('LoginPage', () => {
    test('renders login form', () => {
        renderWithRouter(<LoginPage />, { route: '/login' });
        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
        expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    test('shows link to register page', () => {
        renderWithRouter(<LoginPage />, { route: '/login' });
        expect(screen.getByText('Register')).toBeInTheDocument();
    });

    test('shows error on failed login', async () => {
        const mockLogin = jest.fn().mockRejectedValue(new Error('Invalid username or password'));
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: mockLogin, register: jest.fn(), logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<LoginPage />, { route: '/login' });
        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'u' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'p' } });
        fireEvent.click(screen.getByText('Sign In'));

        await waitFor(() => {
            expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
        });
    });

    test('navigates home on successful login', async () => {
        const mockLogin = jest.fn().mockResolvedValue({ token: 'tok', user: { id: '1', username: 'u' } });
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: mockLogin, register: jest.fn(), logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<LoginPage />, { route: '/login' });
        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'u' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } });
        fireEvent.click(screen.getByText('Sign In'));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });

    test('navigates to /admin on admin login', async () => {
        const mockLogin = jest.fn().mockResolvedValue({
            token: 'tok',
            user: { id: 'admin', username: 'admin', isAdmin: true },
        });
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: mockLogin, register: jest.fn(), logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<LoginPage />, { route: '/login' });
        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'admin' } });
        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'adminpass' } });
        fireEvent.click(screen.getByText('Sign In'));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/admin');
        });
    });
});

describe('RegisterPage', () => {
    test('renders register form', () => {
        renderWithRouter(<RegisterPage />, { route: '/register' });
        expect(screen.getByText('Register')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Username/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Password/)).toBeInTheDocument();
        expect(screen.getByText('Create Account')).toBeInTheDocument();
    });

    test('shows link to login page', () => {
        renderWithRouter(<RegisterPage />, { route: '/register' });
        expect(screen.getByText('Login')).toBeInTheDocument();
    });

    test('shows error on duplicate username', async () => {
        const mockRegister = jest.fn().mockRejectedValue(new Error('Username already taken'));
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: jest.fn(), register: mockRegister, logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<RegisterPage />, { route: '/register' });
        fireEvent.change(screen.getByPlaceholderText(/Username/), { target: { value: 'taken' } });
        fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: 'pass123' } });
        fireEvent.click(screen.getByText('Create Account'));

        await waitFor(() => {
            expect(screen.getByText('Username already taken')).toBeInTheDocument();
        });
    });

    test('navigates home on successful registration', async () => {
        const mockRegister = jest.fn().mockResolvedValue({ token: 'tok', user: { id: '1', username: 'new' } });
        mockUseAuth.mockReturnValue({
            user: null, loading: false,
            login: jest.fn(), register: mockRegister, logout: jest.fn(),
            getToken: jest.fn(() => null),
        });

        renderWithRouter(<RegisterPage />, { route: '/register' });
        fireEvent.change(screen.getByPlaceholderText(/Username/), { target: { value: 'newuser' } });
        fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: 'pass123' } });
        fireEvent.click(screen.getByText('Create Account'));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });
});
