import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, File as FileIcon } from 'lucide-react';
import { api } from '../api';

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

export default function UploadPage() {
    const navigate = useNavigate();
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

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
        setUploading(true);
        setError('');
        try {
            const formData = new FormData();
            files.forEach(f => formData.append('files', f));
            formData.append('retention_type', 'permanent');
            const data = await api.upload(formData);
            navigate(data.sharePath);
        } catch (e) {
            setError(e.message);
            setUploading(false);
        }
    }

    return (
        <div className="upload-page">
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
                    <p className="drop-zone-sub">No account needed</p>
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
