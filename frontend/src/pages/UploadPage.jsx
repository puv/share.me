import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Upload, X, File as FileIcon, LogOut } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

export default function UploadPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(null);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);
    const startTimeRef = useRef(null);

    const guestLimit = 50 * 1024 * 1024; // 50 MB
    const uploadLimit = user ? (user.maxUploadSize || 1073741824) : guestLimit;
    const uploadLimitLabel = user ? '1 GB' : '50 MB';

    function resetUpload() {
        setUploading(false);
        setProgress(0);
        setUploadSpeed(null);
        startTimeRef.current = null;
    }

    function handleFiles(newFiles) {
        const fileArr = Array.from(newFiles);
        setFiles(prev => [...prev, ...fileArr]);
        setError('');
    }

    function removeFile(index) {
        setFiles(prev => prev.filter((_, i) => i !== index));
    }

    function handleDrop(e) {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
    }

    async function handleUpload() {
        if (files.length === 0) {
            setError('Please select at least one file');
            return;
        }
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        if (totalSize > uploadLimit) {
            setError(`Total file size exceeds the ${uploadLimitLabel} upload limit. ${user ? '' : 'Login or register to unlock 1 GB.'}`);
            return;
        }
        setUploading(true);
        setError('');
        setProgress(0);
        setUploadSpeed(null);
        startTimeRef.current = performance.now();
        try {
            const formData = new FormData();
            files.forEach(f => formData.append('files', f));
            formData.append('retention_type', 'permanent');
            const data = await api.upload(formData, (loaded, total) => {
                const pct = Math.round((loaded / total) * 100);
                setProgress(pct);
                const elapsed = (performance.now() - startTimeRef.current) / 1000;
                if (elapsed > 0.1) {
                    setUploadSpeed(loaded / elapsed);
                }
            });
            navigate(data.sharePath);
        } catch (e) {
            setError(e.message);
            resetUpload();
        }
    }

    return (
        <div className="upload-page">
            {user && (
                <div className="upload-user-bar">
                    <span className="upload-user-name">{user.username}</span>
                    <button className="upload-user-logout" onClick={logout} title="Logout">
                        <LogOut size={16} />
                    </button>
                </div>
            )}
            <div className="upload-center">
                <div
                    className={`drop-zone ${dragOver ? 'drag-over' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                >
                    <Upload size={48} color="var(--gray)" style={{ marginBottom: '16px' }} />
                    <p className="drop-zone-text">
                        <strong>Click to browse</strong> or drag and drop files here
                    </p>
                    <p className="drop-zone-sub" onClick={(e) => e.stopPropagation()}>
                        {user
                            ? <>Logged in as <strong>{user.username}</strong> — {uploadLimitLabel} limit</>
                            : <>{uploadLimitLabel} limit — <Link to="/login">Login</Link> or <Link to="/register">Register</Link> for 1 GB</>
                        }
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                </div>
                {files.length > 0 && (
                    <ul className="file-list">
                        {files.map((file, i) => (
                            <li key={i} className="file-item">
                                <div className="file-item-info">
                                    <FileIcon size={18} color="var(--gray)" />
                                    <span className="file-item-name">{file.name}</span>
                                    <span className="file-item-size">{formatSize(file.size)}</span>
                                </div>
                                <button
                                    type="button"
                                    className="file-item-remove"
                                    onClick={() => removeFile(i)}
                                    aria-label="Remove file"
                                >
                                    <X size={18} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {uploading && (
                    <div className="upload-progress">
                        <div className="upload-progress-stats">
                            <span className="upload-progress-pct">Uploading {progress}%</span>
                            <span className="upload-progress-speed">
                                {uploadSpeed !== null ? (uploadSpeed / 1e6).toFixed(2) + ' MB/s' : '—'}
                            </span>
                        </div>
                        <div className="upload-progress-track">
                            <div
                                className="upload-progress-fill"
                                style={{ width: progress + '%' }}
                            />
                        </div>
                    </div>
                )}
                {error && <div className="alert alert-error">{error}</div>}
                {files.length > 0 && (
                    <button
                        className="btn btn-primary btn-upload"
                        onClick={handleUpload}
                        disabled={uploading}
                    >
                        <Upload size={18} />
                        {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
                    </button>
                )}
            </div>
        </div>
    );
}
