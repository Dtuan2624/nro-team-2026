const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer
contextBridge.exposeInMainWorld('nroAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  loadWebContent: () => ipcRenderer.invoke('web:load'),
  chooseWebsiteDirectory: () => ipcRenderer.invoke('web:chooseDirectory'),
  saveWebContent: (content) => ipcRenderer.invoke('web:save', content),
  websiteImageDataUrl: (imagePath) => ipcRenderer.invoke('web:imageDataUrl', imagePath),
  uploadWebsiteImages: (options) => ipcRenderer.invoke('web:uploadImages', options),
  websiteForumList: (options) => ipcRenderer.invoke('web:forumList', options),
  websiteForumPin: (options) => ipcRenderer.invoke('web:forumPin', options),
  websiteForumRemoveImage: (options) => ipcRenderer.invoke('web:forumRemoveImage', options),
  websiteForumDeletePost: (options) => ipcRenderer.invoke('web:forumDeletePost', options),
  websiteForumDeleteComment: (options) => ipcRenderer.invoke('web:forumDeleteComment', options),

  // DB
  connect: (cfg) => ipcRenderer.invoke('db:connect', cfg),
  isConnected: () => ipcRenderer.invoke('db:isConnected'),
  stats: () => ipcRenderer.invoke('db:stats'),
  tables: () => ipcRenderer.invoke('db:tables'),
  tableData: (opts) => ipcRenderer.invoke('db:table', opts),
  getRow: (opts) => ipcRenderer.invoke('db:row', opts),
  itemTemplates: (opts) => ipcRenderer.invoke('game:itemTemplates', opts),
  renameCostume: (opts) => ipcRenderer.invoke('game:renameCostume', opts),
  updateCostume: (opts) => ipcRenderer.invoke('game:updateCostume', opts),
  createCostume: (opts) => ipcRenderer.invoke('game:createCostume', opts),
  fusionForms: () => ipcRenderer.invoke('game:fusionForms'),
  updateFusionForm: (opts) => ipcRenderer.invoke('game:updateFusionForm', opts),
  createFusionForm: (opts) => ipcRenderer.invoke('game:createFusionForm', opts),
  deleteFusionForm: (opts) => ipcRenderer.invoke('game:deleteFusionForm', opts),
  parts: () => ipcRenderer.invoke('game:parts'),
  updatePart: (opts) => ipcRenderer.invoke('game:updatePart', opts),
  itemOptions: (opts) => ipcRenderer.invoke('game:itemOptions', opts),
  mobTemplates: () => ipcRenderer.invoke('game:mobTemplates'),
  npcTemplates: () => ipcRenderer.invoke('game:npcTemplates'),
  headAvatars: () => ipcRenderer.invoke('game:headAvatars'),
  skillTemplates: () => ipcRenderer.invoke('game:skillTemplates'),
  taskTemplates: () => ipcRenderer.invoke('game:taskTemplates'),
  updateRow: (opts) => ipcRenderer.invoke('db:update', opts),
  insertRow: (opts) => ipcRenderer.invoke('db:insert', opts),
  deleteRow: (opts) => ipcRenderer.invoke('db:delete', opts),
  runSql: (opts) => ipcRenderer.invoke('db:sql', opts),
  topPlayers: () => ipcRenderer.invoke('db:topPlayers'),
  transactions: (opts) => ipcRenderer.invoke('db:transactions', opts),
  maintenance: (opts) => ipcRenderer.invoke('db:maintenance', opts),
  quickSql: (opts) => ipcRenderer.invoke('db:quickSql', opts),
  accountAction: (opts) => ipcRenderer.invoke('db:accountAction', opts),
  shopDetails: (opts) => ipcRenderer.invoke('db:shopDetails', opts),
  addShopTab: (opts) => ipcRenderer.invoke('db:addShopTab', opts),
  deleteShopTab: (opts) => ipcRenderer.invoke('db:deleteShopTab', opts),
  updateShopItem: (opts) => ipcRenderer.invoke('db:updateShopItem', opts),
  addShopItem: (opts) => ipcRenderer.invoke('db:addShopItem', opts),
  deleteShopItem: (opts) => ipcRenderer.invoke('db:deleteShopItem', opts),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  serverStatus: () => ipcRenderer.invoke('server:status'),
  serverCommand: (opts) => ipcRenderer.invoke('server:command', opts),

  // Dialogs
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),

  // Shell
  openExternal: (url) => ipcRenderer.send('shell:open', url),
});
