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
    getSchedule: (startDate, endDate) => electron.ipcRenderer.invoke("erp:getSchedule", { startDate, endDate }),
    getResourceSchedule: (startDate, endDate) => electron.ipcRenderer.invoke("erp:getResourceSchedule", { startDate, endDate }),
    exportWeeklyReservations: (startDate, endDate) => electron.ipcRenderer.invoke("erp:exportWeeklyReservations", { startDate, endDate }),
    getWeeklyReservationDetails: (startDate, endDate, options) => electron.ipcRenderer.invoke("erp:getWeeklyReservationDetails", { startDate, endDate, options }),
    dumpBookingInfo: (id) => electron.ipcRenderer.invoke("erp:dumpBookingInfo", { id }),
    createReservation: (data) => electron.ipcRenderer.invoke("erp:createReservation", { data }),
    getEducationByDate: (date) => electron.ipcRenderer.invoke("erp:getEducationByDate", { date }),
    getStudentDetail: (id) => electron.ipcRenderer.invoke("erp:getStudentDetail", { id }),
    updateMemo: (id, memo, name, time, date) => electron.ipcRenderer.invoke("erp:updateMemo", { id, memo, name, time, date }),
    writeMemosBatch: (memoList) => electron.ipcRenderer.invoke("erp:writeMemosBatch", { memoList }),
    deleteHistory: (id, history) => electron.ipcRenderer.invoke("erp:deleteHistory", { id, history }),
    updateHistory: (id, oldHistory, newHistory) => electron.ipcRenderer.invoke("erp:updateHistory", { id, oldHistory, newHistory }),
    setHeadless: (headless) => electron.ipcRenderer.invoke("erp:setHeadless", { headless }),
    fetchMembers: (options) => electron.ipcRenderer.invoke("erp:fetchMembers", options),
    registerToErp: (naverData) => electron.ipcRenderer.invoke("erp:registerToErp", naverData),
    syncNaver: (dryRun) => electron.ipcRenderer.invoke("erp:syncNaver", { dryRun }),
    cancelReservation: (id, date) => electron.ipcRenderer.invoke("erp:cancelReservation", { id, date }),
    markAbsent: (id, date) => electron.ipcRenderer.invoke("erp:markAbsent", { id, date }),
    unmarkAbsent: (id, date) => electron.ipcRenderer.invoke("erp:unmarkAbsent", { id, date }),
    updateReservation: (id, date, updates) => electron.ipcRenderer.invoke("erp:updateReservation", { id, date, updates })
  },
  member: {
    list: () => electron.ipcRenderer.invoke("member:list"),
    save: (members) => electron.ipcRenderer.invoke("member:save", members)
  },
  scraper: {
    naverLogin: () => electron.ipcRenderer.invoke("scraper:naverLogin"),
    kakaoLogin: () => electron.ipcRenderer.invoke("scraper:kakaoLogin"),
    getNaverBookings: () => electron.ipcRenderer.invoke("scraper:getNaverBookings"),
    getKakaoBookings: () => electron.ipcRenderer.invoke("scraper:getKakaoBookings")
  },
  settings: {
    getCredentials: () => electron.ipcRenderer.invoke("settings:getCredentials"),
    saveCredentials: (id, password) => electron.ipcRenderer.invoke("settings:saveCredentials", { id, password })
  }
});
