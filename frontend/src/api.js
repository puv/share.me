const BASE = '/api';

async function request(url, options = {}) {
    let res;
    try {
        res = await fetch(BASE + url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
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
    upload(formData) {
        return fetch(BASE + '/upload', {
            method: 'POST',
            body: formData,
        }).then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.errors?.join(', ') || 'Upload failed');
            return data;
        }).catch((err) => {
            // Network errors from fetch come through as TypeError
            if (err instanceof TypeError && err.message === 'Failed to fetch') {
                throw new Error('Network error — server may be unavailable');
            }
            throw err;
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
