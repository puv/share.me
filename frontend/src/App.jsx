import React from 'react';
import { Routes, Route } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import DownloadPage from './pages/DownloadPage';
import AdminPage from './pages/AdminPage';
import AdminLoginPage from './pages/AdminLoginPage';

export default function App() {
    return (
        <div className="app">
            <main className="app-main">
                <Routes>
                    <Route path="/" element={<UploadPage />} />
                    <Route path="/d/:id" element={<DownloadPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/admin/login" element={<AdminLoginPage />} />
                </Routes>
            </main>
        </div>
    );
}
