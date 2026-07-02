import QRCode from 'qrcode';

export async function generateQrDataUrl(url) {
    try {
        return await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        });
    } catch (e) {
        throw new Error('QR code generation failed');
    }
}

export async function generateQrPngBuffer(url) {
    try {
        return await QRCode.toBuffer(url, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
            type: 'png',
        });
    } catch (e) {
        throw new Error('QR code PNG generation failed');
    }
}
