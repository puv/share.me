const BASE = '/api';

async function request(url, options = {}) {
    const token = localStorage.getItem('shareme_auth_token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    let res;
    try {
        res = await fetch(BASE + url, {
            headers,
            ...options,
        });
    } catch {
        throw new Error('Network error — server may be unavailable');
    }
    let data;
    try {
        data = await res.json();
    } catch {
        throw new Error('Invalid response from server');
    }
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

export const api = {
    upload(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', BASE + '/upload');

            // Attach auth token if available
            const token = localStorage.getItem('shareme_auth_token');
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            }

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(e.loaded, e.total);
                }
            });

            xhr.addEventListener('load', () => {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error(data.error || data.errors?.join(', ') || 'Upload failed'));
                    } else {
                        resolve(data);
                    }
                } catch {
                    reject(new Error('Invalid response from server'));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Network error — server may be unavailable'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('Upload cancelled'));
            });

            xhr.send(formData);
        });
    },

    getUpload(id) {
        return request('/upload/' + encodeURIComponent(id));
    },

    updateUpload(id, body) {
        return request('/upload/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify(body),
        });
    },

    verifyPassword(id, password) {
        return request('/upload/' + encodeURIComponent(id) + '/password', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });
    },

    deleteUpload(id) {
        return request('/upload/' + encodeURIComponent(id), {
            method: 'DELETE',
        });
    },

    adminLogin(username, password) {
        return request('/admin/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    },

    adminLogout() {
        return request('/admin/logout', { method: 'POST' });
    },

    adminCheck() {
        return request('/admin/check');
    },

    adminStats() {
        return request('/admin/stats');
    },

    adminUploads(page = 1) {
        return request('/admin/uploads?page=' + page);
    },

    adminUploadDetail(id) {
        return request('/admin/upload/' + encodeURIComponent(id));
    },

    adminDeleteUpload(id) {
        return request('/admin/upload/' + encodeURIComponent(id), {
            method: 'DELETE',
        });
    },

    adminGetSettings() {
        return request('/admin/settings');
    },


    // Auth
    login(username, password) {
        return request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    },

    register(username, password) {
        return request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    },

    getMe() {
        return request('/auth/me');
    },
    adminUpdateSettings(settings) {
        return request('/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    },
};

export function fileDownloadUrl(fileId) {
    return '/api/file/' + fileId;
}

export function zipDownloadUrl(uploadId) {
    return '/api/upload/' + uploadId + '/zip';
}

export function qrDownloadUrl(uploadId) {
    return '/api/upload/' + uploadId + '/qr';
}
