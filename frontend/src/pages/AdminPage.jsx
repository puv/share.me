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
                navigate('/login');
            }
        } catch (e) {
            setIsAdmin(false);
            navigate('/login');
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
        navigate('/login');
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
        return <div className="admin-layout"><div className="admin-loading">Checking access...</div></div>;
    }

    return (
        <div className="admin-layout">
            <div className="admin-header">
                <h1>Admin Panel</h1>
                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${viewMode === 'dashboard' ? 'active' : ''}`}
                        onClick={() => switchView('dashboard')}
                    >
                        Dashboard
                    </button>
                    <button
                        className={`admin-tab ${viewMode === 'uploads' ? 'active' : ''}`}
                        onClick={() => switchView('uploads')}
                    >
                        Uploads
                    </button>
                    <button
                        className={`admin-tab ${viewMode === 'settings' ? 'active' : ''}`}
                        onClick={() => switchView('settings')}
                    >
                        Settings
                    </button>
                    <button className="admin-tab" onClick={handleLogout}>
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
                        <div className="admin-header">
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
                    <form className="admin-settings-form" onSubmit={handleSaveSettings}>
                        <div className="admin-section-title">Upload Size Limits</div>

                        <div className="form-group">
                            <label className="form-label">Guest Max Upload Size</label>
                            <div className="form-row">
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    value={(() => {
                                        const bytes = parseInt(settings.guest_max_upload_size || '52428800', 10);
                                        return bytes >= 1e9 ? Math.round(bytes / 1e9) : Math.round(bytes / 1e6);
                                    })()}
                                    onChange={(e) => {
                                        const num = parseInt(e.target.value, 10) || 0;
                                        const unit = document.querySelector('[name="guest_size_unit"]')?.value;
                                        const bytes = unit === 'GB' ? num * 1e9 : num * 1e6;
                                        setSettings({ ...settings, guest_max_upload_size: String(bytes) });
                                    }}
                                />
                                <select
                                    name="guest_size_unit"
                                    className="form-select"
                                    style={{ maxWidth: '80px' }}
                                    defaultValue={parseInt(settings.guest_max_upload_size || '52428800', 10) >= 1e9 ? 'GB' : 'MB'}
                                    onChange={(e) => {
                                        const input = e.target.parentElement.querySelector('input');
                                        const num = parseInt(input.value, 10) || 0;
                                        const bytes = e.target.value === 'GB' ? num * 1e9 : num * 1e6;
                                        setSettings({ ...settings, guest_max_upload_size: String(bytes) });
                                    }}
                                >
                                    <option value="MB">MB</option>
                                    <option value="GB">GB</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">User Max Upload Size</label>
                            <div className="form-row">
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    value={(() => {
                                        const bytes = parseInt(settings.user_max_upload_size || '1073741824', 10);
                                        return bytes >= 1e9 ? Math.round(bytes / 1e9) : Math.round(bytes / 1e6);
                                    })()}
                                    onChange={(e) => {
                                        const num = parseInt(e.target.value, 10) || 0;
                                        const unit = document.querySelector('[name="user_size_unit"]')?.value;
                                        const bytes = unit === 'GB' ? num * 1e9 : num * 1e6;
                                        setSettings({ ...settings, user_max_upload_size: String(bytes) });
                                    }}
                                />
                                <select
                                    name="user_size_unit"
                                    className="form-select"
                                    style={{ maxWidth: '80px' }}
                                    defaultValue={parseInt(settings.user_max_upload_size || '1073741824', 10) >= 1e9 ? 'GB' : 'MB'}
                                    onChange={(e) => {
                                        const input = e.target.parentElement.querySelector('input');
                                        const num = parseInt(input.value, 10) || 0;
                                        const bytes = e.target.value === 'GB' ? num * 1e9 : num * 1e6;
                                        setSettings({ ...settings, user_max_upload_size: String(bytes) });
                                    }}
                                >
                                    <option value="MB">MB</option>
                                    <option value="GB">GB</option>
                                </select>
                            </div>
                        </div>

                        <div className="admin-section-title">Retention Limits</div>

                        <div className="form-group">
                            <label className="form-label">Guest Max Retention</label>
                            <div className="form-row">
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    placeholder="Value"
                                    value={(() => {
                                        const raw = settings.guest_max_retention || 'permanent';
                                        if (raw === 'permanent' || raw === 'one_download') return '';
                                        const match = raw.match(/^(\d+)/);
                                        return match ? match[1] : '';
                                    })()}
                                    disabled={(() => {
                                        const raw = settings.guest_max_retention || 'permanent';
                                        return raw === 'permanent' || raw === 'one_download';
                                    })()}
                                    onChange={(e) => {
                                        const num = e.target.value;
                                        const unit = document.querySelector('[name="guest_retention_unit"]')?.value || 'days';
                                        if (unit === 'permanent' || unit === 'one_download') {
                                            setSettings({ ...settings, guest_max_retention: unit });
                                        } else {
                                            setSettings({ ...settings, guest_max_retention: num + unit });
                                        }
                                    }}
                                />
                                <select
                                    name="guest_retention_unit"
                                    className="form-select"
                                    value={(() => {
                                        const raw = settings.guest_max_retention || 'permanent';
                                        if (raw === 'permanent' || raw === 'one_download') return raw;
                                        const match = raw.match(/\d+(.+)/);
                                        return match ? match[1] : 'days';
                                    })()}
                                    onChange={(e) => {
                                        const unit = e.target.value;
                                        if (unit === 'permanent' || unit === 'one_download') {
                                            setSettings({ ...settings, guest_max_retention: unit });
                                        } else {
                                            const input = e.target.parentElement.querySelector('input');
                                            const num = input.value || '7';
                                            setSettings({ ...settings, guest_max_retention: num + unit });
                                        }
                                    }}
                                >
                                    <option value="days">Days</option>
                                    <option value="weeks">Weeks</option>
                                    <option value="months">Months</option>
                                    <option value="years">Years</option>
                                    <option value="one_download">One Download</option>
                                    <option value="permanent">Permanent</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">User Max Retention</label>
                            <div className="form-row">
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    placeholder="Value"
                                    value={(() => {
                                        const raw = settings.user_max_retention || 'permanent';
                                        if (raw === 'permanent' || raw === 'one_download') return '';
                                        const match = raw.match(/^(\d+)/);
                                        return match ? match[1] : '';
                                    })()}
                                    disabled={(() => {
                                        const raw = settings.user_max_retention || 'permanent';
                                        return raw === 'permanent' || raw === 'one_download';
                                    })()}
                                    onChange={(e) => {
                                        const num = e.target.value;
                                        const unit = document.querySelector('[name="user_retention_unit"]')?.value || 'days';
                                        if (unit === 'permanent' || unit === 'one_download') {
                                            setSettings({ ...settings, user_max_retention: unit });
                                        } else {
                                            setSettings({ ...settings, user_max_retention: num + unit });
                                        }
                                    }}
                                />
                                <select
                                    name="user_retention_unit"
                                    className="form-select"
                                    value={(() => {
                                        const raw = settings.user_max_retention || 'permanent';
                                        if (raw === 'permanent' || raw === 'one_download') return raw;
                                        const match = raw.match(/\d+(.+)/);
                                        return match ? match[1] : 'days';
                                    })()}
                                    onChange={(e) => {
                                        const unit = e.target.value;
                                        if (unit === 'permanent' || unit === 'one_download') {
                                            setSettings({ ...settings, user_max_retention: unit });
                                        } else {
                                            const input = e.target.parentElement.querySelector('input');
                                            const num = input.value || '7';
                                            setSettings({ ...settings, user_max_retention: num + unit });
                                        }
                                    }}
                                >
                                    <option value="days">Days</option>
                                    <option value="weeks">Weeks</option>
                                    <option value="months">Months</option>
                                    <option value="years">Years</option>
                                    <option value="one_download">One Download</option>
                                    <option value="permanent">Permanent</option>
                                </select>
                            </div>
                        </div>

                        <div className="admin-section-title">General</div>

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
