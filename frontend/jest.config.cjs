module.exports = {
    transform: {
        '^.+\\.jsx?$': 'babel-jest',
    },
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '\\.css$': '<rootDir>/tests/cssMock.js',
    },
    setupFiles: ['<rootDir>/tests/setup.cjs'],
    transformIgnorePatterns: [
        'node_modules/(?!(lucide-react)/)',
    ],
};
