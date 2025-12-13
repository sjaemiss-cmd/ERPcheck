"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const playwright = require("playwright");
class ErpService {
  constructor() {
    __publicField(this, "browser", null);
    __publicField(this, "page", null);
    __publicField(this, "isHeadless", false);
    __publicField(this, "isBusy", false);
    this.registerIpcHandlers();
  }
  registerIpcHandlers() {
    electron.ipcMain.handle("erp:login", async (_, { id, password }) => {
      return await this.login(id, password);
    });
    electron.ipcMain.handle("erp:getSchedule", async (_, { weeks }) => {
      return await this.getWeeklySchedule(weeks);
    });
    electron.ipcMain.handle("erp:createReservation", async (_, { data }) => {
      return await this.createReservation(data);
    });
    electron.ipcMain.handle("erp:getTodayEducation", async () => {
      return await this.getTodayEducation();
    });
    electron.ipcMain.handle("erp:getStudentDetail", async (_, { id }) => {
      return await this.getStudentDetail(id);
    });
    electron.ipcMain.handle("erp:updateMemo", async (_, { id, memo, name, time }) => {
      return await this.updateMemo(id, memo, name, time);
    });
    electron.ipcMain.handle("erp:writeMemosBatch", async (_, { memoList }) => {
      return await this.writeMemosBatch(memoList);
    });
  }
  async start() {
    if (this.browser && !this.browser.isConnected()) {
      this.browser = null;
      this.page = null;
      this.isBusy = false;
    }
    if (this.page && this.page.isClosed()) {
      this.page = null;
      this.isBusy = false;
    }
    if (!this.browser) {
      console.log("[ErpService] Launching browser...");
      this.browser = await playwright.chromium.launch({ headless: this.isHeadless });
      this.browser.on("disconnected", () => {
        console.log("[ErpService] Browser disconnected");
        this.browser = null;
        this.page = null;
        this.isBusy = false;
      });
      this.page = await this.browser.newPage();
      console.log("[ErpService] Browser launched");
    } else if (!this.page) {
      this.page = await this.browser.newPage();
    }
  }
  async login(id, pass) {
    console.log(`[ErpService] login called with id: ${id}`);
    try {
      this.isHeadless = false;
      await this.start();
      if (!this.page) {
        console.error("[ErpService] Page not initialized");
        return false;
      }
      const page = this.page;
      if (page.url().includes("/index/calender") || page.url().includes("/index/main")) {
        console.log("[ErpService] Already logged in (URL check)");
        return true;
      }
      await page.goto("https://sook0517.cafe24.com/", { waitUntil: "domcontentloaded" });
      if (page.url().includes("/index/calender") || page.url().includes("/index/main")) {
        console.log("[ErpService] Already logged in");
        return true;
      }
      try {
        await page.waitForSelector('input[name="id"]', { state: "visible", timeout: 5e3 });
        await page.fill('input[name="id"]', id);
      } catch (e) {
        console.error("[ErpService] ID input not found");
        return false;
      }
      try {
        const pwdInput = page.locator('input[name="pwd"]').or(page.locator('input[type="password"]')).first();
        if (await pwdInput.count() > 0) {
          await pwdInput.fill(pass);
        } else {
          console.error("[ErpService] Password input not found");
          return false;
        }
      } catch (e) {
        console.error("[ErpService] Password fill failed:", e);
        return false;
      }
      await page.click('button[type="submit"]');
      try {
        await page.waitForNavigation({ timeout: 1e4, waitUntil: "domcontentloaded" });
      } catch (e) {
        console.log("[ErpService] Navigation timeout");
      }
      const url = page.url();
      console.log("[ErpService] URL after login:", url);
      if (url.includes("/index/main") || url.includes("/index/member") || url.includes("/index/calender")) {
        console.log("[ErpService] Login successful");
        return true;
      }
      return false;
    } catch (e) {
      console.error("[ErpService] Login exception:", e);
      return false;
    }
  }
  async getTodayEducation() {
    var _a;
    console.log("[ErpService] getTodayEducation called");
    if (this.isBusy) {
      return { operationTime: "", students: [] };
    }
    this.isBusy = true;
    try {
      await this.start();
      if (!this.page || this.page.isClosed()) {
        this.isBusy = false;
        return { operationTime: "", students: [] };
      }
      const page = this.page;
      if (!page.url().includes("/index/calender")) {
        await page.goto("https://sook0517.cafe24.com/index/calender", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1e3);
      }
      const eventsData = await page.evaluate(() => {
        const $2 = window.$;
        if (!$2) return [];
        let cal = $2("#calendar");
        if (cal.length === 0) cal = $2(".fc").parent();
        if (cal.length > 0 && cal.fullCalendar) {
          const events = cal.fullCalendar("clientEvents");
          return events.map((e) => ({
            id: e._id || e.id,
            title: e.title,
            start: e.start ? e.start.format() : null,
            end: e.end ? e.end.format() : null,
            className: e.className
          }));
        }
        return [];
      });
      console.log(`[ErpService] Raw JS Events found: ${eventsData.length}`);
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const todayEvents = eventsData.filter((e) => e.start && e.start.startsWith(todayStr));
      todayEvents.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
      console.log(`[ErpService] Filtered Today's Events: ${todayEvents.length}`);
      const result = { operationTime: "", students: [] };
      for (let i = 0; i < todayEvents.length; i++) {
        const e = todayEvents[i];
        const title = e.title || "";
        if (title.includes("운영")) {
          if (e.start && e.end) {
            const sTime = e.start.substring(11, 16);
            const eTime = e.end.substring(11, 16);
            result.operationTime = `${sTime} ~ ${eTime}`;
          } else {
            result.operationTime = title;
          }
          continue;
        }
        let cleanTitle = title.replace(/\n/g, " ").trim();
        const tagsToRemove = ["[시간제]", "[미납]", "[보강]", "[예약]", "운영"];
        tagsToRemove.forEach((tag) => {
          cleanTitle = cleanTitle.split(tag).join("");
        });
        cleanTitle = cleanTitle.replace(/\d{1,2}:\d{2}\s*[-~]?\s*(\d{1,2}:\d{2})?/g, "").trim();
        let name = "";
        const parts = cleanTitle.split(/\s+/);
        if (parts.length > 0) {
          name = parts[0];
          if (name.includes("/")) {
            name = name.split("/")[0];
          }
        }
        if (!name) continue;
        let duration = 1;
        if (e.start && e.end) {
          const start = new Date(e.start);
          const end = new Date(e.end);
          const diffMs = end.getTime() - start.getTime();
          duration = diffMs / (1e3 * 60 * 60);
        }
        duration = Math.round(duration * 10) / 10;
        const timeStr = e.start ? e.start.substring(11, 16) : "";
        let history = [];
        let generalMemo = "";
        let photo = "";
        try {
          const eventLocator = page.locator(".fc-event", { hasText: name }).filter({ hasText: timeStr }).first();
          if (await eventLocator.count() > 0) {
            await eventLocator.click({ force: true });
            let modalVisible = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await page.waitForSelector("#modifyMemberModal", { state: "visible", timeout: 2e3 });
                modalVisible = true;
                break;
              } catch (waitErr) {
                try {
                  if (await page.locator("#CalenderModalEdit").isVisible()) {
                    await page.evaluate(() => {
                      if (typeof window.modMemberView === "function") window.modMemberView();
                    });
                  }
                } catch (e2) {
                }
                await page.waitForTimeout(500);
              }
            }
            if (modalVisible) {
              const scrapedData = await page.evaluate(() => {
                const modal = document.querySelector("#modifyMemberModal");
                if (!modal) return { memo: "", history: [], photo: "" };
                const memoEl = modal.querySelector("textarea[name='memo']");
                const memo = memoEl ? memoEl.value : "";
                const historyList = [];
                const rows = modal.querySelectorAll(".form-inline");
                rows.forEach((row) => {
                  const dateInput = row.querySelector("input[name='date[]']");
                  const textInput = row.querySelector("input[name='comment[]']");
                  if (dateInput && textInput && dateInput.value && textInput.value) {
                    historyList.push({ date: dateInput.value, content: textInput.value });
                  }
                });
                const img = modal.querySelector("img#photo_image");
                const photoData = img ? img.src : "";
                return { memo, history: historyList, photo: photoData };
              });
              generalMemo = scrapedData.memo;
              history = scrapedData.history;
              photo = scrapedData.photo;
              await page.evaluate(() => {
                $("#modifyMemberModal").modal("hide");
                $("#CalenderModalEdit").modal("hide");
                $(".modal").modal("hide");
              });
              await page.waitForTimeout(300);
            }
          }
        } catch (err) {
          console.error(`[ErpService] Error fetching details for ${name}:`, err);
          try {
            await page.evaluate(() => {
              $(".modal").modal("hide");
            });
          } catch (e2) {
          }
        }
        const student = {
          id: String(i),
          name,
          time: timeStr,
          duration,
          status: "pending",
          type: "기타",
          history,
          generalMemo,
          photo,
          index: i
        };
        result.students.push(student);
      }
      console.log("[ErpService] Closing browser...");
      await ((_a = this.browser) == null ? void 0 : _a.close());
      this.browser = null;
      this.page = null;
      this.isBusy = false;
      return result;
    } catch (e) {
      console.error("[ErpService] Error in getTodayEducation:", e);
      if (this.browser) {
        await this.browser.close().catch(() => {
        });
        this.browser = null;
        this.page = null;
      }
      this.isBusy = false;
      return { operationTime: "", students: [] };
    }
  }
  async getStudentDetail(_id) {
    return { generalMemo: "", history: [] };
  }
  // New helper method for core memo logic
  async _updateMemoCore(name, time, memo) {
    var _a;
    if (!this.page) return false;
    const page = this.page;
    try {
      const eventLocator = page.locator(".fc-event", { hasText: name }).filter({ hasText: time }).first();
      if (await eventLocator.count() === 0) {
        console.error(`[ErpService] Event not found for ${name} at ${time}`);
        return false;
      }
      await eventLocator.click({ force: true });
      let modalVisible = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.waitForSelector("#modifyMemberModal", { state: "visible", timeout: 2e3 });
          modalVisible = true;
          break;
        } catch (waitErr) {
          try {
            if (await page.locator("#CalenderModalEdit").isVisible()) {
              await page.evaluate(() => {
                if (typeof window.modMemberView === "function") window.modMemberView();
              });
            }
          } catch (e) {
          }
          await page.waitForTimeout(500);
        }
      }
      if (!modalVisible) {
        console.error("[ErpService] Member modal not opening");
        await page.evaluate(() => {
          $(".modal").modal("hide");
        });
        return false;
      }
      const plusBtn = page.locator("#modifyMemberModal .comment_btn .plus");
      if (await plusBtn.count() > 0) {
        await plusBtn.click();
        await page.waitForTimeout(500);
      } else {
        console.error("[ErpService] Plus button not found");
      }
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const dateInputs = page.locator("#modifyMemberModal input[name='date[]']");
      const commentInputs = page.locator("#modifyMemberModal input[name='comment[]']");
      if (await dateInputs.count() > 0) {
        const lastDateInput = dateInputs.last();
        const lastCommentInput = commentInputs.last();
        await lastDateInput.click();
        await lastDateInput.fill(todayStr);
        await lastDateInput.press("Enter");
        await lastDateInput.press("Tab");
        await lastDateInput.evaluate((el) => {
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("blur", { bubbles: true }));
        });
        await page.waitForTimeout(500);
        await lastCommentInput.click();
        await lastCommentInput.fill(memo);
        await lastCommentInput.press("Tab");
      }
      const saveBtn = page.locator("#modifyMemberModal button:has-text('수정')").or(page.locator("#modifyMemberModal button:has-text('저장')")).first();
      if (await saveBtn.count() > 0) {
        page.once("dialog", (dialog) => dialog.accept());
        await saveBtn.click();
        await page.waitForTimeout(1e3);
      } else {
        console.error("[ErpService] Save button not found");
      }
      await page.evaluate(() => {
        $("#modifyMemberModal").modal("hide");
        $("#CalenderModalEdit").modal("hide");
        $(".modal").modal("hide");
      });
      await page.waitForTimeout(500);
      return true;
    } catch (e) {
      console.error("[ErpService] Error in _updateMemoCore:", e);
      try {
        await ((_a = this.page) == null ? void 0 : _a.evaluate(() => {
          $(".modal").modal("hide");
        }));
      } catch {
      }
      return false;
    }
  }
  // Updated updateMemo to use name and time for matching
  async updateMemo(_id, memo, name, time) {
    console.log(`[ErpService] updateMemo called for ${name} at ${time} with memo: ${memo}`);
    if (!name || !time) {
      console.error("[ErpService] Name or Time missing for updateMemo");
      return false;
    }
    if (this.isBusy) {
      console.warn("[ErpService] Service is busy");
      return false;
    }
    this.isBusy = true;
    try {
      await this.start();
      if (!this.page) {
        this.isBusy = false;
        return false;
      }
      const loginSuccess = await this.login("dobong", "1010");
      if (!loginSuccess) {
        console.error("[ErpService] Login failed during updateMemo");
        this.isBusy = false;
        return false;
      }
      if (!this.page.url().includes("/index/calender")) {
        await this.page.goto("https://sook0517.cafe24.com/index/calender", { waitUntil: "domcontentloaded" });
      }
      const success = await this._updateMemoCore(name, time, memo);
      this.isBusy = false;
      return success;
    } catch (e) {
      console.error("[ErpService] Error in updateMemo:", e);
      this.isBusy = false;
      return false;
    }
  }
  async writeMemosBatch(memoList) {
    console.log(`[ErpService] writeMemosBatch called with ${memoList.length} items`);
    const results = {};
    if (this.isBusy) {
      console.warn("[ErpService] Service is busy");
      return {};
    }
    this.isBusy = true;
    try {
      await this.start();
      if (!this.page) {
        this.isBusy = false;
        return {};
      }
      const loginSuccess = await this.login("dobong", "1010");
      if (!loginSuccess) {
        console.error("[ErpService] Login failed during batch");
        this.isBusy = false;
        return {};
      }
      if (!this.page.url().includes("/index/calender")) {
        await this.page.goto("https://sook0517.cafe24.com/index/calender", { waitUntil: "domcontentloaded" });
      }
      for (const item of memoList) {
        console.log(`[ErpService] Batch processing: ${item.name} (${item.time})`);
        const success = await this._updateMemoCore(item.name, item.time, item.text);
        results[item.index] = success;
        if (!success) {
          console.error(`[ErpService] Failed to write memo for ${item.name}`);
        }
        await this.page.waitForTimeout(1e3);
      }
      if (this.browser) {
        console.log("[ErpService] Batch finished, closing browser");
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
      this.isBusy = false;
      return results;
    } catch (e) {
      console.error("[ErpService] Error in writeMemosBatch:", e);
      this.isBusy = false;
      return results;
    }
  }
  async getWeeklySchedule(_weeks = 2) {
    return [];
  }
  async createReservation(_data) {
    return true;
  }
}
class ScraperService {
  constructor() {
    __publicField(this, "browser", null);
    __publicField(this, "page", null);
  }
  async naverLogin() {
    try {
      if (!this.browser) {
        this.browser = await playwright.chromium.launch({ headless: false });
        this.page = await this.browser.newPage();
      }
      await this.page.goto("https://nid.naver.com/nidlogin.login");
      console.log("[ScraperService] Please login to Naver manually...");
      return true;
    } catch (e) {
      console.error("[ScraperService] Naver login error:", e);
      return false;
    }
  }
  async kakaoLogin() {
    try {
      if (!this.browser) {
        this.browser = await playwright.chromium.launch({ headless: false });
        this.page = await this.browser.newPage();
      }
      await this.page.goto("https://accounts.kakao.com/login");
      console.log("[ScraperService] Please login to Kakao manually...");
      return true;
    } catch (e) {
      console.error("[ScraperService] Kakao login error:", e);
      return false;
    }
  }
  async getNaverBookings() {
    return [];
  }
  async getKakaoBookings() {
    return [];
  }
}
let mainWindow = null;
const erpService = new ErpService();
const scraperService = new ScraperService();
console.log("Services initialized:", erpService, scraperService);
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.NODE_ENV === "development" || !electron.app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.ipcMain.handle("scraper:naverLogin", async () => {
  return await scraperService.naverLogin();
});
electron.ipcMain.handle("scraper:kakaoLogin", async () => {
  return await scraperService.kakaoLogin();
});
electron.ipcMain.handle("scraper:getNaverBookings", async () => {
  return await scraperService.getNaverBookings();
});
electron.ipcMain.handle("scraper:getKakaoBookings", async () => {
  return await scraperService.getKakaoBookings();
});
