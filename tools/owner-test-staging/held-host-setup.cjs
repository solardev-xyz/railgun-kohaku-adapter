/* global jest */
// The actual host vault/metadata reader must use only FREEDOM_IDENTITY_DATA.
// Electron import is controlled, never a native application or default profile.
jest.mock('electron', () => ({
  app: { getPath() { throw Error('Unexpected non-disposable host path'); } },
  ipcMain: { handle() { throw Error('Unexpected IPC registration'); } },
}), { virtual: true });
