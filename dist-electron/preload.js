"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
electron.contextBridge.exposeInMainWorld("api", {
  erp: {
    login: (credentials) => electron.ipcRenderer.invoke("erp:login", credentials),
    getSchedule: (weeks) => electron.ipcRenderer.invoke("erp:getSchedule", { weeks }),
    createReservation: (data) => electron.ipcRenderer.invoke("erp:createReservation", { data }),
    getTodayEducation: () => electron.ipcRenderer.invoke("erp:getTodayEducation"),
    getStudentDetail: (id) => electron.ipcRenderer.invoke("erp:getStudentDetail", { id }),
    updateMemo: (id, memo, name, time) => electron.ipcRenderer.invoke("erp:updateMemo", { id, memo, name, time }),
    writeMemosBatch: (memoList) => electron.ipcRenderer.invoke("erp:writeMemosBatch", { memoList }),
    deleteHistory: (id, history) => electron.ipcRenderer.invoke("erp:deleteHistory", { id, history }),
    updateHistory: (id, oldHistory, newHistory) => electron.ipcRenderer.invoke("erp:updateHistory", { id, oldHistory, newHistory }),
    setHeadless: (headless) => electron.ipcRenderer.invoke("erp:setHeadless", { headless })
  },
  scraper: {
    naverLogin: () => electron.ipcRenderer.invoke("scraper:naverLogin"),
    kakaoLogin: () => electron.ipcRenderer.invoke("scraper:kakaoLogin"),
    getNaverBookings: () => electron.ipcRenderer.invoke("scraper:getNaverBookings"),
    getKakaoBookings: () => electron.ipcRenderer.invoke("scraper:getKakaoBookings")
  },
  settings: {
    saveCredentials: (creds) => electron.ipcRenderer.invoke("settings:saveCredentials", creds),
    getCredentials: () => electron.ipcRenderer.invoke("settings:getCredentials")
  }
});
