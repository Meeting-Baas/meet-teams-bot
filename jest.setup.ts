jest.setTimeout(30000)

global.console.error = jest.fn()

// Mock Playwright functions for tests
jest.mock('./src/browser', () => ({
    initializeBrowser: jest.fn(),
    cleanupBrowser: jest.fn(),
    findBackgroundPage: jest.fn(),
    tryOpenBrowser: jest.fn(),
    utils: {
        listenPage: jest.fn(),
        removeListenPage: jest.fn(),
    },
}))
