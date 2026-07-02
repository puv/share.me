import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Lock, Download, File, Archive, Trash2, QrCode, Copy, Check, RefreshCw, X } from 'lucide-react';
import { api, fileDownloadUrl, zipDownloadUrl, qrDownloadUrl } from '../api';

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
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

export default function DownloadPage() {
    const { id } = useParams();
    const [upload, setUpload] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [updateError, setUpdateError] = useState('');
    const [updateSuccess, setUpdateSuccess] = useState('');

    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [submittingPassword, setSubmittingPassword] = useState(false);

    const [retentionType, setRetentionType] = useState('permanent');
    const [retentionValue, setRetentionValue] = useState(7);
    const [newPassword, setNewPassword] = useState('');
    const [newAlias, setNewAlias] = useState('');
    const [saving, setSaving] = useState(false);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [copied, setCopied] = useState(false);

    const [deleted, setDeleted] = useState(false);

    useEffect(() => {
        loadUpload();
    }, [id]);

    async function loadUpload() {
        try {
            const data = await api.getUpload(id);
            setUpload(data);
            if (data.isOwner) {
                setRetentionType(data.retention_type || 'permanent');
                setRetentionValue(data.retention_value || 7);
                setNewAlias(data.alias || '');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handlePasswordSubmit(e) {
        e.preventDefault();
        setSubmittingPassword(true);
        setPasswordError('');
        try {
            const data = await api.verifyPassword(id, password);
            setUpload(data);
            if (data.isOwner) {
                setRetentionType(data.retention_type || 'permanent');
                setRetentionValue(data.retention_value || 7);
                setNewAlias(data.alias || '');
            }
        } catch (e) {
            setPasswordError(e.message);
        } finally {
            setSubmittingPassword(false);
        }
    }

    async function handleDelete() {
        if (!confirm('Delete this upload? This cannot be undone.')) return;
        setDeleteError('');
        try {
            await api.deleteUpload(id);
            setDeleted(true);
        } catch (e) {
            setDeleteError(e.message);
        }
    }

    async function handleSaveSettings() {
        setSaving(true);
        setUpdateError('');
        setUpdateSuccess('');
        try {
            const body = {
                retention_type: retentionType,
                retention_value: ['days', 'weeks', 'months', 'years'].includes(retentionType) ? retentionValue : undefined,
                password: newPassword || undefined,
                alias: newAlias || undefined,
            };
            await api.updateUpload(id, body);
            setUpdateSuccess('Settings updated');
            setTimeout(() => setUpdateSuccess(''), 3000);
            await loadUpload();
        } catch (e) {
            setUpdateError(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleOpenQrDialog() {
        setQrDialogOpen(true);
        if (!qrDataUrl) {
            try {
                const res = await fetch(qrDownloadUrl(upload.id || id));
                if (res.ok) {
                    const blob = await res.blob();
                    const reader = new FileReader();
                    reader.onload = () => setQrDataUrl(reader.result);
                    reader.readAsDataURL(blob);
                }
            } catch {
                // QR fetch failed silently — dialog stays open with no image
            }
        }
    }

    function handleCloseQrDialog() {
        setQrDialogOpen(false);
    }

    function handleCopyLink() {
        const shareUrl = window.location.origin + '/d/' + (upload.alias || upload.id);
        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    if (loading) {
        return <div className="page-center"><div className="loading-text">Loading...</div></div>;
    }

    if (deleted) {
        return (
            <div className="page-center">
                <div className="card center-card">
                    <h1>Upload Deleted</h1>
                    <p>The upload and all associated files have been deleted.</p>
                    <Link to="/" className="btn btn-primary" style={{ marginTop: '16px' }}>Upload New Files</Link>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-center">
                <div className="card center-card">
                    <h1>Not Available</h1>
                    <p>{error}</p>
                    <Link to="/" className="btn btn-primary" style={{ marginTop: '16px' }}>Upload New Files</Link>
                </div>
            </div>
        );
    }

    if (upload && upload.hasPassword && (!upload.files || upload.files.length === 0)) {
        return (
            <div className="page-center">
                <div className="card center-card password-card">
                    <Lock size={48} color="var(--orange)" style={{ marginBottom: '16px' }} />
                    <h2>Password Required</h2>
                    <p>This upload is password protected.</p>
                    {passwordError && <div className="alert alert-error">{passwordError}</div>}
                    <form onSubmit={handlePasswordSubmit}>
                        <input
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            autoFocus
                            required
                        />
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submittingPassword}
                            style={{ width: '100%', marginTop: '12px' }}
                        >
                            {submittingPassword ? 'Verifying...' : 'Unlock'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (!upload) {
        return (
            <div className="page-center">
                <div className="card center-card">
                    <h1>Not Found</h1>
                    <Link to="/" className="btn btn-primary" style={{ marginTop: '16px' }}>Upload New Files</Link>
                </div>
            </div>
        );
    }

    const files = upload.files || [];
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    return (
        <div className="page-center download-layout">
            <div className="card download-box">
                <h2>Files</h2>
                {files.length === 0 ? (
                    <p className="empty-text">No files</p>
                ) : (
                    <ul className="download-file-list">
                        {files.map((file) => (
                            <li key={file.id} className="download-file-item">
                                <div className="file-detail">
                                    <File size={18} color="var(--gray)" />
                                    <div className="file-detail-info">
                                        <span className="file-detail-name">{file.original_name}</span>
                                        <span className="file-detail-size">{formatSize(file.size)}</span>
                                    </div>
                                </div>
                                <a
                                    href={fileDownloadUrl(file.id)}
                                    className="btn btn-primary btn-sm"
                                    download
                                >
                                    <Download size={14} /> Download
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
                {files.length > 1 && (
                    <a href={zipDownloadUrl(upload.id || id)} className="btn btn-secondary" style={{ marginTop: '12px', width: '100%' }}>
                        <Archive size={16} /> Download All as ZIP
                    </a>
                )}
                <div className="download-stats">
                    <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
                    <span>{formatSize(totalSize)}</span>
                    <span>{upload.download_count} download{upload.download_count !== 1 ? 's' : ''}</span>
                </div>
            </div>

            {upload.isOwner && (
                <div className="card download-box settings-box">
                    <h2>Settings</h2>

                    {updateError && <div className="alert alert-error">{updateError}</div>}
                    {updateSuccess && <div className="alert alert-success">{updateSuccess}</div>}
                    {deleteError && <div className="alert alert-error">{deleteError}</div>}

                    <div className="form-group">
                        <label className="form-label">Retention</label>
                        <div className="form-row">
                            <select
                                className="form-select"
                                value={retentionType}
                                onChange={(e) => setRetentionType(e.target.value)}
                            >
                                <option value="one_download">One Download</option>
                                <option value="days">Days</option>
                                <option value="weeks">Weeks</option>
                                <option value="months">Months</option>
                                <option value="years">Years</option>
                                <option value="permanent">Permanent</option>
                            </select>
                            {['days', 'weeks', 'months', 'years'].includes(retentionType) && (
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    value={retentionValue}
                                    onChange={(e) => setRetentionValue(parseInt(e.target.value, 10) || 1)}
                                    placeholder="Value"
                                    style={{ maxWidth: '100px' }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            Password {upload.hasPassword && <span className="badge">set</span>}
                        </label>
                        <input
                            type="password"
                            className="form-input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Change password (leave empty)"
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Custom Link</label>
                        <input
                            type="text"
                            className="form-input"
                            value={newAlias}
                            onChange={(e) => setNewAlias(e.target.value.replace(/[^a-z0-9\-_]/g, '').toLowerCase())}
                            placeholder="my-file-share"
                            maxLength={40}
                        />
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={handleSaveSettings}
                        disabled={saving}
                        style={{ width: '100%' }}
                    >
                        <RefreshCw size={16} />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>

                    <div className="share-link-row">
                        <span className="share-link-label">Share link</span>
                        <div className="share-link-input-row">
                            <input
                                type="text"
                                className="form-input"
                                readOnly
                                value={window.location.origin + '/d/' + (upload.alias || upload.id)}
                            />
                            <button className="btn btn-secondary btn-sm" onClick={handleCopyLink} title="Copy link">
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={handleOpenQrDialog} title="Show QR Code">
                                <QrCode size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="delete-section">
                        <button className="btn btn-danger" onClick={handleDelete} style={{ width: '100%' }}>
                            <Trash2 size={16} /> Delete Upload
                        </button>
                    </div>
                </div>
            )}

            {qrDialogOpen && (
                <div className="modal-overlay" onClick={handleCloseQrDialog}>
                    <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={handleCloseQrDialog} aria-label="Close QR dialog">
                            <X size={20} />
                        </button>
                        <h3>QR Code</h3>
                        {qrDataUrl ? (
                            <div className="qr-modal-image">
                                <img src={qrDataUrl} alt="QR Code for share link" />
                            </div>
                        ) : (
                            <p className="qr-modal-loading">Loading QR code...</p>
                        )}
                        <a
                            href={qrDownloadUrl(upload.id || id)}
                            className="btn btn-secondary"
                            download
                            style={{ marginTop: '12px', width: '100%' }}
                        >
                            Download PNG
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
