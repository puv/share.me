import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Trash2, RefreshCw, HardDrive, Upload as UploadIcon, Download, Clock, File } from 'lucide-react';
import { api } from '../api';

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
}

function retentionLabel(type, value) {
    switch (type) {
        case 'one_download': return 'One download';
        case 'days': return `${value} day${value !== 1 ? 's' : ''}`;
        case 'weeks': return `${value} week${value !== 1 ? 's' : ''}`;
        case 'months': return `${value} month${value !== 1 ? 's' : ''}`;
        case 'years': return `${value} year${value !== 1 ? 's' : ''}`;
        case 'permanent': return 'Permanent';
        default: return type;
    }
}

export default function AdminPage() {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(null);
    const [stats, setStats] = useState(null);
    const [uploads, setUploads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [viewMode, setViewMode] = useState('dashboard'); // dashboard | uploads | settings
    const [settings, setSettings] = useState({});
    const [settingsSaved, setSettingsSaved] = useState(false);

    useEffect(() => {
        checkAdmin();
    }, []);

    async function checkAdmin() {
        try {
            const data = await api.adminCheck();
            if (data.isAdmin) {
                setIsAdmin(true);
                loadDashboard();
            } else {
                setIsAdmin(false);
                navigate('/admin/login');
            }
        } catch (e) {
            setIsAdmin(false);
            navigate('/admin/login');
        }
    }

    async function loadDashboard() {
        try {
            const [statsData, uploadsData] = await Promise.all([
                api.adminStats(),
                api.adminUploads(),
            ]);
            setStats(statsData);
            setUploads(uploadsData.uploads);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function loadSettings() {
        try {
            const data = await api.adminGetSettings();
            setSettings(data);
        } catch (e) {
            setError(e.message);
        }
    }

    async function handleLogout() {
        await api.adminLogout();
        navigate('/admin/login');
    }

    async function handleDelete(uploadId) {
        if (!confirm('Delete this upload? This cannot be undone.')) return;
        try {
            await api.adminDeleteUpload(uploadId);
            setUploads(prev => prev.filter(u => u.id !== uploadId && u.alias !== uploadId));
            loadDashboard();
        } catch (e) {
            setError(e.message);
        }
    }

    async function handleSaveSettings(e) {
        e.preventDefault();
        setSettingsSaved(false);
        try {
            await api.adminUpdateSettings(settings);
            setSettingsSaved(true);
        } catch (e) {
            setError(e.message);
        }
    }

    function switchView(mode) {
        setViewMode(mode);
        setError('');
        setSettingsSaved(false);
        if (mode === 'dashboard') loadDashboard();
        if (mode === 'settings') loadSettings();
    }

    if (isAdmin === null) {
        return <div className="loading">Checking access...</div>;
    }

    return (
        <div className="admin-layout">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <h1>Admin Panel</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className={`btn btn-sm ${viewMode === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => switchView('dashboard')}
                    >
                        Dashboard
                    </button>
                    <button
                        className={`btn btn-sm ${viewMode === 'uploads' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => switchView('uploads')}
                    >
                        Uploads
                    </button>
                    <button
                        className={`btn btn-sm ${viewMode === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => switchView('settings')}
                    >
                        Settings
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={handleLogout}>
                        <LogOut size={14} /> Logout
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {viewMode === 'dashboard' && stats && (
                <>
                    <div className="admin-stats">
                        <div className="admin-stat-card">
                            <div className="admin-stat-value">{stats.totalUploads}</div>
                            <div className="admin-stat-label">Total Uploads</div>
                        </div>
                        <div className="admin-stat-card">
                            <div className="admin-stat-value">{stats.activeUploads}</div>
                            <div className="admin-stat-label">Active</div>
                        </div>
                        <div className="admin-stat-card">
                            <div className="admin-stat-value">{stats.expiredUploads}</div>
                            <div className="admin-stat-label">Expired</div>
                        </div>
                        <div className="admin-stat-card">
                            <div className="admin-stat-value">{formatSize(stats.storageUsed)}</div>
                            <div className="admin-stat-label">Storage Used</div>
                        </div>
                        <div className="admin-stat-card">
                            <div className="admin-stat-value">{stats.totalDownloads}</div>
                            <div className="admin-stat-label">Total Downloads</div>
                        </div>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3>Recent Uploads</h3>
                            <button className="btn btn-sm btn-secondary" onClick={loadDashboard}>
                                <RefreshCw size={14} /> Refresh
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>ID / Alias</th>
                                        <th>Created</th>
                                        <th>Retention</th>
                                        <th>Files</th>
                                        <th>Size</th>
                                        <th>Downloads</th>
                                        <th>Protected</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {uploads.slice(0, 20).map(upload => (
                                        <tr key={upload.id}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {upload.alias || upload.id}
                                            </td>
                                            <td>{formatDate(upload.created_at)}</td>
                                            <td>{retentionLabel(upload.retention_type, upload.retention_value)}</td>
                                            <td>{upload.file_count}</td>
                                            <td>{formatSize(upload.total_size)}</td>
                                            <td>{upload.download_count}</td>
                                            <td>
                                                {upload.hasPassword ? (
                                                    <span className="badge badge-protected">Yes</span>
                                                ) : (
                                                    <span style={{ color: 'var(--gray)' }}>No</span>
                                                )}
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(upload.id)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {viewMode === 'uploads' && (
                <div className="card">
                    <h3>All Uploads</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>ID / Alias</th>
                                    <th>Created</th>
                                    <th>Expires</th>
                                    <th>Retention</th>
                                    <th>Files</th>
                                    <th>Size</th>
                                    <th>Downloads</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uploads.map(upload => {
                                    const isExpired = upload.deleted || (upload.expires_at && new Date(upload.expires_at) <= new Date());
                                    return (
                                        <tr key={upload.id}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {upload.alias || upload.id}
                                            </td>
                                            <td>{formatDate(upload.created_at)}</td>
                                            <td>{upload.expires_at ? formatDate(upload.expires_at) : '-'}</td>
                                            <td>{retentionLabel(upload.retention_type, upload.retention_value)}</td>
                                            <td>{upload.file_count}</td>
                                            <td>{formatSize(upload.total_size)}</td>
                                            <td>{upload.download_count}</td>
                                            <td>
                                                {isExpired ? (
                                                    <span className="badge badge-expired">Expired</span>
                                                ) : (
                                                    <span className="badge badge-active">Active</span>
                                                )}
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(upload.id)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {viewMode === 'settings' && (
                <div className="card">
                    <h3>Settings</h3>
                    {settingsSaved && <div className="alert alert-success">Settings saved</div>}
                    <form onSubmit={handleSaveSettings}>
                        <div className="form-group">
                            <label className="form-label">Max Single File Size (bytes)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings.max_single_file_size || ''}
                                onChange={(e) => setSettings({ ...settings, max_single_file_size: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Max Total Upload Size (bytes)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings.max_total_upload_size || ''}
                                onChange={(e) => setSettings({ ...settings, max_total_upload_size: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cleanup Interval (minutes)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settings.cleanup_interval_minutes || ''}
                                onChange={(e) => setSettings({ ...settings, cleanup_interval_minutes: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Upload Directory</label>
                            <input
                                type="text"
                                className="form-input"
                                value={settings.upload_directory || ''}
                                onChange={(e) => setSettings({ ...settings, upload_directory: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary">Save Settings</button>
                    </form>
                </div>
            )}
        </div>
    );
}
