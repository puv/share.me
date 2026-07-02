import archiver from 'archiver';

export function createZipStream(files, getFilePath) {
    const archive = archiver('zip', {
        zlib: { level: 5 },
    });

    for (const file of files) {
        const filePath = getFilePath(file.stored_name);
        archive.file(filePath, { name: file.original_name });
    }

    archive.finalize();
    return archive;
}
