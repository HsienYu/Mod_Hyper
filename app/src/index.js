const { app, BrowserWindow, ipcMain } = require('electron');

const { homedir } = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line global-require
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1920,
    height: 1200,
    // focusable: false,
    // transparent: false,
    // frame: true,
    // fullscreen: false,
    // alwaysOnTop: false,
    // skipTaskbar: false,
    // enableLargerThanScreen: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // nodeIntegration: true,
      // contextIsolation: true,
      // nodeIntegrationInWorker: true,
      // webSecurity: false,
      // allowRunningInsecureContent: true,
    },
  });

  mainWindow.setSize(1920, 1080);

  const targetDir = path.join(homedir(), 'Downloads');
  console.log(targetDir);

  /**
   * @param {IpcMainEvent} event
   * @param {{buffer: ArrayBuffer, time: string, idx: number, x: number, y: number}} data
   */
  const saveImageHandler = async (event, data) => {
    return;

    const file = path.join(targetDir, `${data.time}_${String(data.idx).padStart(5, '0')}.jpg`);
    const buffer = Buffer.from(data.buffer);
    await fs.writeFile(file, buffer, 'binary');
    console.log(`file: ${file} saved`);
  };

  const saveLookAtImageHandler = async (event, data) => {
    return;

    const file = path.join(targetDir, `lookAt_${data.time}_${String(data.idx).padStart(5, '0')}.jpg`);
    const buffer = Buffer.from(data.buffer);
    await fs.writeFile(file, buffer, 'binary');
    console.log(`file: ${file} saved`);
  };

  // ipc event
  ipcMain.on('save-image', saveImageHandler);
  ipcMain.on('save-lookAtImage', saveLookAtImageHandler);

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

app.commandLine.appendSwitch('ignore-certificate-errors');

//enable hardware acceleration
app.disableHardwareAcceleration(false);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
