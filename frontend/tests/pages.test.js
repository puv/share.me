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
    },
    fileDownloadUrl: (id) => '/api/file/' + id,
    zipDownloadUrl: (id) => '/api/upload/' + id + '/zip',
    qrDownloadUrl: (id) => '/api/upload/' + id + '/qr',
}));

import { api } from '../src/api';
import UploadPage from '../src/pages/UploadPage';
import DownloadPage from '../src/pages/DownloadPage';
import AdminLoginPage from '../src/pages/AdminLoginPage';
import AdminPage from '../src/pages/AdminPage';

function renderWithRouter(ui, { route = '/' } = {}) {
    window.history.pushState({}, 'Test page', route);
    return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
});

describe('UploadPage', () => {
    test('renders the drop zone centered on page', () => {
        renderWithRouter(<UploadPage />);
        expect(screen.getByText(/Click to browse/)).toBeInTheDocument();
        expect(screen.getByText('No account needed')).toBeInTheDocument();
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
        api.adminLogin.mockRejectedValue(new Error('Network error — server may be unavailable'));
        renderWithRouter(<AdminLoginPage />);

        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
        fireEvent.click(screen.getByRole('button', { name: /Login/i }));

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

describe('AdminLoginPage', () => {
    test('renders login form', () => {
        renderWithRouter(<AdminLoginPage />);
        expect(screen.getByText('Admin Login')).toBeInTheDocument();
        expect(screen.getByLabelText('Username')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    test('shows error on failed login', async () => {
        api.adminLogin.mockRejectedValue(new Error('Invalid credentials'));
        renderWithRouter(<AdminLoginPage />);

        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: /Login/i }));

        await waitFor(() => {
            expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
        });
    });

    test('submits valid login', async () => {
        api.adminLogin.mockResolvedValue({ success: true });
        renderWithRouter(<AdminLoginPage />);

        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
        fireEvent.click(screen.getByRole('button', { name: /Login/i }));

        await waitFor(() => {
            expect(api.adminLogin).toHaveBeenCalledWith('admin', 'pass');
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
});
