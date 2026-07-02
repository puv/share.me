import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import UploadPage from './pages/UploadPage';
import DownloadPage from './pages/DownloadPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

export default function App() {
    return (
        <AuthProvider>
            <div className="app">
                <main className="app-main">
                    <Routes>
                        <Route path="/" element={<UploadPage />} />
                        <Route path="/d/:id" element={<DownloadPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                    </Routes>
                </main>
            </div>
        </AuthProvider>
    );
}
