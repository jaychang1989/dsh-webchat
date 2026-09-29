window.__ModuleLoader__.load({
	id: "dsh-webchat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/protocol.ts
		/** API path constants shared by host routes and the browser panel. */
		const WEBChat_API = {
			state: "/api/dsh-webchat/state",
			openLogin: "/api/dsh-webchat/open-login",
			closeBrowser: "/api/dsh-webchat/close-browser",
			newChat: "/api/dsh-webchat/new-chat",
			send: "/api/dsh-webchat/send",
			stop: "/api/dsh-webchat/stop",
			deepThink: "/api/dsh-webchat/deep-think",
			search: "/api/dsh-webchat/search",
			transfer: "/api/dsh-webchat/transfer",
			exportFile: "/api/dsh-webchat/export",
			renameChat: "/api/dsh-webchat/rename",
			deleteChat: "/api/dsh-webchat/delete",
			clearChats: "/api/dsh-webchat/clear",
			webChats: "/api/dsh-webchat/web-chats",
			recover: "/api/dsh-webchat/recover"
		};
		//#endregion
		//#region src/client/api.ts
		/**
		* Browser-side API client for the /api/dsh-webchat route family. The only
		* data access path the panel components use — plain fetch, same origin.
		*/
		async function request(path, body) {
			const response = await fetch(path, {
				method: body === void 0 ? "GET" : "POST",
				headers: body === void 0 ? void 0 : { "content-type": "application/json" },
				body: body === void 0 ? void 0 : JSON.stringify(body)
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok && payload.ok !== true) return {
				...payload,
				ok: false,
				error: payload.error ?? `HTTP ${response.status}`
			};
			return payload;
		}
		var WebChatApi = class {
			state() {
				return request(WEBChat_API.state);
			}
			openLogin() {
				return request(WEBChat_API.openLogin);
			}
			closeBrowser() {
				return request(WEBChat_API.closeBrowser);
			}
			newChat() {
				return request(WEBChat_API.newChat);
			}
			send(text, images) {
				return request(WEBChat_API.send, {
					text,
					images
				});
			}
			stop() {
				return request(WEBChat_API.stop);
			}
			setDeepThink(enabled) {
				return request(WEBChat_API.deepThink, { enabled });
			}
			setSearch(enabled) {
				return request(WEBChat_API.search, { enabled });
			}
			transfer(chatId, cwd, mode, workspaceId, targetSessionId) {
				return request(WEBChat_API.transfer, {
					chatId,
					cwd,
					mode,
					workspaceId,
					targetSessionId
				});
			}
			exportFile(chatId, cwd) {
				return request(WEBChat_API.exportFile, {
					chatId,
					cwd
				});
			}
			renameChat(chatId, title) {
				return request(WEBChat_API.renameChat, {
					chatId,
					title
				});
			}
			deleteChat(chatId) {
				return request(WEBChat_API.deleteChat, { chatId });
			}
			clearChats() {
				return request(WEBChat_API.clearChats);
			}
			webChats() {
				return request(WEBChat_API.webChats);
			}
			recover(title) {
				return request(WEBChat_API.recover, { title });
			}
		};
		//#endregion
		//#region src/client/controller.ts
		const INITIAL = { panelOpen: false };
		/** Plain pub/sub store (no React dependency — used by the DOM sidebar entry). */
		var PanelController = class {
			snapshot = INITIAL;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			set(patch) {
				this.snapshot = {
					...this.snapshot,
					...patch
				};
				for (const listener of [...this.listeners]) listener();
			}
			open() {
				if (!this.snapshot.panelOpen) this.set({ panelOpen: true });
			}
			close() {
				if (this.snapshot.panelOpen) this.set({ panelOpen: false });
			}
			toggle() {
				this.set({ panelOpen: !this.snapshot.panelOpen });
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* dsh-webchat surface copy: zh is the key source, en mirrors every key. The
		* key union (not an object shape) is what the locale machinery wants —
		* LocaleKeysOf<N> intersects the namespace with `string`, so the namespace
		* value must itself be the key union (same pattern as dsh-ssh).
		*/
		const zh = {
			"entry.label": "网页聊天",
			"entry.tooltip": "DeepSeek 网页端聊天（deepseek-chat，Codex ChatGPT 模式）",
			"panel.title": "DeepSeek 网页端聊天",
			"status.engine.stopped": "浏览器未启动",
			"status.engine.launching": "浏览器启动中…",
			"status.engine.ready": "浏览器就绪",
			"status.engine.error": "浏览器错误",
			"status.loggedIn": "已登录",
			"status.notLoggedIn": "未登录",
			"status.unknown": "状态未知",
			"action.openLogin": "打开登录窗口",
			"action.closeBrowser": "关闭浏览器",
			"action.newChat": "新对话",
			"action.recover": "从网页恢复",
			"action.refresh": "刷新",
			"action.send": "发送",
			"action.stop": "停止生成",
			"action.transferToHarness": "转移到 Harness",
			"action.exportFile": "导出为文件",
			"transfer.mode.distill": "蒸馏为任务简报",
			"transfer.mode.raw": "原始记录",
			"transfer.mode.hint": "蒸馏：用 harness LLM 把对话提炼成可执行任务简报；原始记录：原样放入新会话首条消息",
			"transfer.workspace.label": "目标工作区",
			"transfer.workspace.ungrouped": "未分组",
			"transfer.workspace.new": "新建工作区…",
			"transfer.workspace.hint": "转移到所选工作区；未分组则不归入任何工作区",
			"transfer.workspace.created": "已创建并选中工作区 {title}",
			"transfer.workspace.createFailed": "创建工作区失败：{error}",
			"transfer.session.label": "延续到会话",
			"transfer.session.hint": "选择已有 harness 会话以延续（把简报作为新消息追加）；默认新建会话",
			"transfer.session.new": "新建会话",
			"transfer.attached.failed": "会话已创建（{sessionId}），但归入工作区失败，现为未分组",
			"handoff.eyebrow": "交付到 Harness",
			"toggle.deepThink": "深度思考",
			"toggle.search": "智能搜索",
			"toggle.deepThink.hint": "开启 R1 深度思考",
			"toggle.search.hint": "开启联网检索",
			"sidebar.empty": "暂无对话",
			"chats.count": "{count} 条",
			"role.you": "你",
			"chat.rename": "重命名",
			"chat.delete": "删除",
			"chat.delete.confirm": "确认删除？",
			"chat.clearAll": "清空全部",
			"chat.clearAll.confirm": "确认清空全部？",
			"chat.rename.placeholder": "输入新标题…",
			"chat.rename.ok": "确定",
			"chat.rename.cancel": "取消",
			"chat.manage.hint": "管理本地保存的聊天记录（不影响网页端）",
			"toast.rename.done": "已重命名",
			"toast.rename.failed": "重命名失败：{error}",
			"toast.delete.done": "已删除该对话",
			"toast.delete.failed": "删除失败：{error}",
			"toast.clear.done": "已清空全部对话",
			"toast.clear.failed": "清空失败：{error}",
			"model.deepseek-chat": "DeepSeek",
			"model.deepseek-reasoner": "DeepSeek",
			"composer.placeholder": "给 DeepSeek 发送消息…（将发送到网页端）",
			"composer.hint": "Enter 发送 · Shift+Enter 换行",
			"composer.busy": "正在生成回复…",
			"composer.notLoggedIn": "请先登录 DeepSeek 网页端",
			"composer.attach": "图片",
			"composer.attach.hint": "添加本地图片（绝对路径，逗号/换行分隔）",
			"composer.attach.placeholder": "图片绝对路径，逗号或换行分隔",
			"empty.eyebrow": "DeepSeek 网页端 · 桥接开发",
			"empty.title": "先聊，再交付",
			"empty.body": "登录网页端即可开始对话；任何对话都能蒸馏成任务简报，转入 Harness 会话继续开发。",
			"transfer.done": "已创建 Harness 会话 {sessionId}，正在为你打开…",
			"transfer.continued": "已延续 Harness 会话 {sessionId}，正在为你打开…",
			"transfer.failed": "转移到 Harness 失败：{error}",
			"export.done": "已导出到工作区文件：{filePath}",
			"export.failed": "导出失败：{error}",
			"recover.hint": "列出网页端尚未导入本地的会话",
			"recover.empty": "网页端没有未导入的会话",
			"recover.done": "已恢复「{title}」",
			"msg.empty": "（空）",
			"msg.error": "（该回复可能不完整：{error}）",
			"streaming": "生成中"
		};
		/** Bilingual balance enforced: en must cover every zh key. */
		const en = {
			"entry.label": "Web Chat",
			"entry.tooltip": "DeepSeek web chat (deepseek-chat, Codex ChatGPT mode)",
			"panel.title": "DeepSeek Web Chat",
			"status.engine.stopped": "Browser not started",
			"status.engine.launching": "Starting browser…",
			"status.engine.ready": "Browser ready",
			"status.engine.error": "Browser error",
			"status.loggedIn": "Logged in",
			"status.notLoggedIn": "Not logged in",
			"status.unknown": "Unknown",
			"action.openLogin": "Open login window",
			"action.closeBrowser": "Close browser",
			"action.newChat": "New chat",
			"action.recover": "Recover from web",
			"action.refresh": "Refresh",
			"action.send": "Send",
			"action.stop": "Stop",
			"action.transferToHarness": "Transfer to Harness",
			"action.exportFile": "Export to file",
			"transfer.mode.distill": "Distill to task brief",
			"transfer.mode.raw": "Raw transcript",
			"transfer.mode.hint": "Distill: condense the chat into an executable brief via the harness LLM; Raw: replay the full transcript as the session's first message",
			"transfer.workspace.label": "Target workspace",
			"transfer.workspace.ungrouped": "Ungrouped",
			"transfer.workspace.new": "New workspace…",
			"transfer.workspace.hint": "Transfer into the chosen workspace; ungrouped leaves it out of any workspace",
			"transfer.workspace.created": "Created and selected workspace {title}",
			"transfer.workspace.createFailed": "Create workspace failed: {error}",
			"transfer.session.label": "Continue into session",
			"transfer.session.hint": "Continue into an existing harness session (append the brief as a new message); default creates a new one",
			"transfer.session.new": "New session",
			"transfer.attached.failed": "Session created ({sessionId}) but attaching to workspace failed; it is ungrouped",
			"handoff.eyebrow": "Handoff to Harness",
			"toggle.deepThink": "DeepThink",
			"toggle.search": "Search",
			"toggle.deepThink.hint": "Enable R1 deep think",
			"toggle.search.hint": "Enable web search",
			"sidebar.empty": "No chats",
			"chats.count": "{count} msgs",
			"role.you": "You",
			"chat.rename": "Rename",
			"chat.delete": "Delete",
			"chat.delete.confirm": "Delete?",
			"chat.clearAll": "Clear all",
			"chat.clearAll.confirm": "Clear all?",
			"chat.rename.placeholder": "New title…",
			"chat.rename.ok": "OK",
			"chat.rename.cancel": "Cancel",
			"chat.manage.hint": "Manage locally saved transcripts (does not affect the web)",
			"toast.rename.done": "Renamed",
			"toast.rename.failed": "Rename failed: {error}",
			"toast.delete.done": "Chat deleted",
			"toast.delete.failed": "Delete failed: {error}",
			"toast.clear.done": "All chats cleared",
			"toast.clear.failed": "Clear failed: {error}",
			"model.deepseek-chat": "DeepSeek",
			"model.deepseek-reasoner": "DeepSeek",
			"composer.placeholder": "Message DeepSeek… (sent via the web)",
			"composer.hint": "Enter to send · Shift+Enter for newline",
			"composer.busy": "Generating…",
			"composer.notLoggedIn": "Sign in to DeepSeek web first",
			"composer.attach": "Images",
			"composer.attach.hint": "Attach local images (absolute paths, comma/newline separated)",
			"composer.attach.placeholder": "Image absolute paths (comma or newline separated)",
			"empty.eyebrow": "DeepSeek Web · Bridge to Code",
			"empty.title": "Chat first, hand off later",
			"empty.body": "Sign in to the web and start chatting; any chat can be distilled into a task brief and handed off to Harness.",
			"transfer.done": "Created Harness session {sessionId}; opening it…",
			"transfer.continued": "Continued Harness session {sessionId}; opening it…",
			"transfer.failed": "Transfer failed: {error}",
			"export.done": "Exported to workspace file: {filePath}",
			"export.failed": "Export failed: {error}",
			"recover.hint": "List web conversations not yet imported locally",
			"recover.empty": "No unimported web conversations",
			"recover.done": "Recovered \"{title}\"",
			"msg.empty": "(empty)",
			"msg.error": "(reply may be incomplete: {error})",
			"streaming": "generating"
		};
		//#endregion
		//#region \0dsh-css:src/client/panel/panel.module.css.mjs
		const css = "[data-pane=conversation],[class*=centerCol]{position:relative}[data-dsh-webchat-view]{z-index:60;background:var(--dsw-alias-bg-base);display:none;position:absolute;inset:0}html[data-dsh-webchat-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-webchat-view]{display:block}html[data-dsh-webchat-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane=conversation]>:not([data-dsh-webchat-view]),html[data-dsh-webchat-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*=centerCol]>:not([data-dsh-webchat-view]){display:none!important}.jbF1yq_entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}.jbF1yq_entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}.jbF1yq_entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}.jbF1yq_entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.jbF1yq_entryLabel{text-overflow:ellipsis;overflow:hidden}[data-dsh-frame][data-sidebar-collapsed] .jbF1yq_entry{justify-content:center;width:100%;padding:0}[data-dsh-frame][data-sidebar-collapsed] .jbF1yq_entryLabel{display:none}.jbF1yq_view{box-sizing:border-box;overflow:hidden}.jbF1yq_panel,.jbF1yq_panel *{box-sizing:border-box}.jbF1yq_panel{background:var(--dsw-alias-bg-base);min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);flex-direction:column;gap:8px;padding:12px 14px 14px;display:flex}.jbF1yq_panelHeader{flex-wrap:wrap;flex:none;align-items:center;gap:10px;display:flex}.jbF1yq_panelTitle{letter-spacing:-.01em;color:var(--dsw-alias-label-primary);white-space:nowrap;margin:0;font-size:15px;font-weight:700}.jbF1yq_headerSpacer{flex:1;min-width:8px}.jbF1yq_statusChip{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated));color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;align-items:center;gap:7px;padding:4px 10px;font-size:11.5px;display:inline-flex}.jbF1yq_statusText{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);letter-spacing:.01em;overflow:hidden}.jbF1yq_statusDot{border-radius:50%;flex:none;width:7px;height:7px}.jbF1yq_statusDot[data-state=ok]{background:var(--dsw-alias-state-success,#22c55e)}.jbF1yq_statusDot[data-state=warn]{background:var(--dsw-alias-state-warning,#f59e0b)}.jbF1yq_statusDot[data-state=bad]{background:var(--dsw-alias-state-danger,#ef4444)}.jbF1yq_statusDot[data-state=busy]{background:var(--dsw-alias-state-info,#3b82f6);animation:1.2s ease-in-out infinite jbF1yq_dshWcPulse}@keyframes jbF1yq_dshWcPulse{0%,to{opacity:1}50%{opacity:.35}}.jbF1yq_panelBody{flex:1;gap:10px;min-height:0;display:flex}.jbF1yq_sidebar{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated));border-radius:10px;flex-direction:column;flex:0 0 172px;gap:6px;min-width:0;padding:8px;display:flex;overflow:hidden}.jbF1yq_sidebarNew{justify-content:center;width:100%}.jbF1yq_recoverList{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated));border-radius:8px;flex-direction:column;gap:2px;max-height:160px;padding:4px;display:flex;overflow-y:auto}.jbF1yq_recoverItem{width:100%;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:6px;padding:6px 8px;font-size:12.5px;display:block}.jbF1yq_recoverItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8080801f)}.jbF1yq_recoverItem:disabled{opacity:.5;cursor:default}.jbF1yq_recoverTitle{text-overflow:ellipsis;white-space:nowrap;max-width:100%;display:inline-block;overflow:hidden}.jbF1yq_recoverEmpty{color:var(--dsw-alias-label-tertiary);padding:6px 8px;font-size:12px}.jbF1yq_sidebarList{flex-direction:column;flex:1;gap:2px;min-height:0;display:flex;overflow-y:auto}.jbF1yq_sidebarItem{border-radius:7px;align-items:center;gap:2px;display:flex}.jbF1yq_sidebarItem:hover{background:var(--dsw-alias-interactive-bg-hover,#8080801f)}.jbF1yq_sidebarItem[data-active]{background:var(--dsw-specific-sidebar-nav-item-active,var(--dsw-alias-interactive-bg-hover))}.jbF1yq_sidebarRow{min-width:0;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:7px;flex-direction:column;flex:1;align-items:flex-start;gap:1px;padding:6px 8px;display:flex}.jbF1yq_sidebarTitle{text-overflow:ellipsis;white-space:nowrap;width:100%;font-size:12.5px;line-height:1.3;display:block;overflow:hidden}.jbF1yq_sidebarMeta{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);color:var(--dsw-alias-label-tertiary);font-size:10px}.jbF1yq_sidebarActions{opacity:0;flex:none;gap:2px;padding-right:4px;transition:opacity .12s;display:flex}.jbF1yq_sidebarItem:hover .jbF1yq_sidebarActions,.jbF1yq_sidebarItem[data-active] .jbF1yq_sidebarActions{opacity:1}.jbF1yq_sidebarAction{width:22px;height:22px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}.jbF1yq_sidebarAction:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.jbF1yq_sidebarActionDanger{background:var(--dsw-alias-state-danger,#ef4444);color:#fff;cursor:pointer;white-space:nowrap;border:none;border-radius:6px;justify-content:center;align-items:center;height:22px;padding:0 6px;font-size:11px;display:inline-flex}.jbF1yq_sidebarRename{flex:1;align-items:center;gap:2px;min-width:0;padding:2px;display:flex}.jbF1yq_sidebarRenameInput{min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer1));border:1px solid var(--dsw-alias-state-business-primary,#4f6bfa);border-radius:6px;outline:none;flex:1;padding:4px 6px;font-size:12px}.jbF1yq_sidebarEmpty{text-align:center;color:var(--dsw-alias-label-tertiary);margin:auto;padding:12px 8px;font-size:12px}.jbF1yq_sidebarClear{justify-content:center;width:100%}.jbF1yq_main{flex-direction:column;flex:1;gap:8px;min-width:0;min-height:0;display:flex;overflow:hidden}.jbF1yq_composerToolbar{flex:none;align-items:center;gap:6px;padding:2px 12px;display:flex}.jbF1yq_toggleButton{appearance:none;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);cursor:pointer;white-space:nowrap;background:0 0;border-radius:999px;align-items:center;gap:5px;padding:4px 11px;font-size:11.5px;transition:color .12s,border-color .12s,background .12s;display:inline-flex}.jbF1yq_toggleButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}.jbF1yq_toggleButton:disabled{opacity:.45;cursor:not-allowed}.jbF1yq_toggleButton[data-active]{color:var(--dsw-alias-state-business-primary,#4f6bfa);border-color:var(--dsw-alias-state-business-primary,#4f6bfa);background:var(--dsw-alias-interactive-bg-hover,#8080801a);font-weight:600}.jbF1yq_segmented{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:8px;flex:none;align-items:stretch;gap:2px;padding:2px;display:inline-flex}.jbF1yq_segmentedButton{appearance:none;font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:6px;padding:4px 10px;font-size:11.5px}.jbF1yq_segmentedButton:hover:not([data-active]):not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.jbF1yq_segmentedButton[data-active]{background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-layer1));color:var(--dsw-alias-state-business-primary,#4f6bfa);font-weight:600;box-shadow:0 1px 2px #0000001f}.jbF1yq_button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer1));color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;border-radius:8px;align-items:center;gap:6px;padding:6px 12px;font-size:12.5px;transition:background .12s,filter .12s;display:inline-flex}.jbF1yq_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.jbF1yq_button:disabled{opacity:.45;cursor:not-allowed}.jbF1yq_buttonPrimary{background:var(--dsw-alias-state-business-primary,#4f6bfa);color:#fff;border-color:#0000}.jbF1yq_buttonPrimary:hover:not(:disabled){filter:brightness(1.08)}.jbF1yq_buttonDanger{background:var(--dsw-alias-state-danger,#ef4444);color:#fff;border-color:#0000}.jbF1yq_buttonGhost{color:var(--dsw-alias-label-secondary);background:0 0;border-color:#0000;padding:5px 8px;font-size:12px}.jbF1yq_buttonGhost:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.jbF1yq_messageList{flex-direction:column;flex:1;gap:14px;min-height:0;padding:4px 2px;display:flex;overflow-y:auto}.jbF1yq_messageRow{flex-direction:column;gap:5px;max-width:92%;display:flex}.jbF1yq_messageRow[data-role=user]{align-self:flex-end;align-items:flex-end}.jbF1yq_messageRow[data-role=assistant]{align-self:flex-start;align-items:flex-start}.jbF1yq_messageMeta{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);align-items:baseline;gap:8px;padding:0 4px;font-size:10.5px;line-height:1;display:flex}.jbF1yq_messageSpeaker{color:var(--dsw-alias-label-secondary);font-weight:600}.jbF1yq_messageTime{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.jbF1yq_streamBadge{color:var(--dsw-alias-state-info,#3b82f6)}.jbF1yq_messageBubble{overflow-wrap:anywhere;border-radius:12px;min-width:0;max-width:100%;padding:10px 14px;font-size:13.5px;line-height:1.6}.jbF1yq_messageRow[data-role=user] .jbF1yq_messageBubble{background:var(--dsw-alias-state-business-primary,#4f6bfa);color:#fff;border-bottom-right-radius:4px}.jbF1yq_messageRow[data-role=assistant] .jbF1yq_messageBubble{background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated));border:1px solid var(--dsw-alias-border-l1);border-bottom-left-radius:4px}.jbF1yq_messageError{color:var(--dsw-alias-state-danger,#ef4444);font-size:11px}.jbF1yq_emptyState{text-align:center;flex-direction:column;align-items:center;gap:10px;max-width:420px;margin:auto;padding:24px 20px;display:flex}.jbF1yq_emptyEyebrow{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-state-business-primary,#4f6bfa);font-size:10.5px}.jbF1yq_emptyTitle{letter-spacing:-.01em;color:var(--dsw-alias-label-primary);margin:0;font-size:17px;font-weight:700}.jbF1yq_emptyBody{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.6}.jbF1yq_composer{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer1));border-radius:12px;flex-direction:column;flex:none;transition:border-color .12s;display:flex}.jbF1yq_composer:focus-within{border-color:var(--dsw-alias-state-business-primary,#4f6bfa)}.jbF1yq_composerInput{resize:none;min-height:44px;max-height:180px;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;border:none;outline:none;flex:1;padding:10px 12px 6px;font-size:13.5px;line-height:1.5}.jbF1yq_composerInput::placeholder{color:var(--dsw-alias-label-tertiary)}.jbF1yq_attachInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated));color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;margin:0 12px 4px;padding:7px 10px;font-size:12.5px}.jbF1yq_attachInput::placeholder{color:var(--dsw-alias-label-tertiary)}.jbF1yq_composerFooter{align-items:center;gap:8px;padding:0 8px 8px 12px;display:flex}.jbF1yq_composerHint{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);color:var(--dsw-alias-label-tertiary);letter-spacing:.02em;font-size:10.5px}.jbF1yq_composerSpacer{flex:1}.jbF1yq_handoffDock{border:1px solid var(--dsw-alias-border-l2);border-left:2px solid var(--dsw-alias-state-business-primary,#4f6bfa);background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated));border-radius:10px;flex-wrap:wrap;flex:none;align-items:center;gap:10px;padding:9px 12px;display:flex}.jbF1yq_handoffEyebrow{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);letter-spacing:.1em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;font-size:10.5px}.jbF1yq_handoffSpacer{flex:1;min-width:8px}.jbF1yq_workspaceSelect{appearance:none;max-width:280px;font-size:12px;font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer1));border:1px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:8px;flex:none;padding:6px 10px}.jbF1yq_workspaceSelect:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6bfa);outline-offset:1px}.jbF1yq_markdown{font-size:13.5px;line-height:1.65}.jbF1yq_markdown p{margin:.4em 0}.jbF1yq_markdown pre{background:var(--dsw-alias-bg-deep,#00000073);border-radius:8px;margin:.6em 0;padding:10px 12px;font-size:12.5px;line-height:1.5;position:relative;overflow-x:auto}.jbF1yq_markdown code{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);font-size:.92em}.jbF1yq_markdown :not(pre)>code{background:var(--dsw-alias-interactive-bg-hover,#8080802e);border-radius:5px;padding:1px 5px}.jbF1yq_markdown h1,.jbF1yq_markdown h2,.jbF1yq_markdown h3,.jbF1yq_markdown h4{margin:.8em 0 .4em;line-height:1.3}.jbF1yq_markdown ul,.jbF1yq_markdown ol{margin:.4em 0;padding-left:1.4em}.jbF1yq_markdown blockquote{border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);margin:.5em 0;padding:2px 12px}.jbF1yq_tableWrap{overflow-x:auto}.jbF1yq_markdown table{border-collapse:collapse;margin:.6em 0;font-size:12.5px}.jbF1yq_markdown th,.jbF1yq_markdown td{border:1px solid var(--dsw-alias-border-l2);padding:4px 10px}.jbF1yq_markdown sup.jbF1yq_citation{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);color:var(--dsw-alias-state-business-primary,#4f6bfa);background:var(--dsw-alias-interactive-bg-hover,#80808029);vertical-align:super;white-space:nowrap;border-radius:999px;margin:0 2px;padding:0 4px;font-size:9.5px;font-weight:600;line-height:1.4}.jbF1yq_markdown a{color:var(--dsw-alias-state-business-primary,#4f6bfa)}.jbF1yq_markdown details{background:var(--dsw-alias-interactive-bg-hover,#8080801f);border-radius:8px;margin:.5em 0;padding:6px 10px;font-size:12.5px}.jbF1yq_markdown summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-weight:600}.jbF1yq_toast{z-index:200;background:var(--dsw-alias-bg-elevated);border:1px solid var(--dsw-alias-border-l2);max-width:420px;color:var(--dsw-alias-label-primary);border-radius:10px;padding:10px 14px;font-size:13px;animation:.18s ease-out jbF1yq_dshWcToast;position:fixed;bottom:20px;right:20px;box-shadow:0 8px 24px #0000002e}@keyframes jbF1yq_dshWcToast{0%{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.jbF1yq_button:focus-visible,.jbF1yq_segmentedButton:focus-visible,.jbF1yq_toggleButton:focus-visible,.jbF1yq_sidebarRow:focus-visible,.jbF1yq_sidebarAction:focus-visible,.jbF1yq_sidebarActionDanger:focus-visible,.jbF1yq_sidebarRenameInput:focus-visible,.jbF1yq_composerInput:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6bfa);outline-offset:1px}@media (prefers-reduced-motion:reduce){.jbF1yq_statusDot[data-state=busy],.jbF1yq_toast{animation:none}.jbF1yq_button,.jbF1yq_composer{transition:none}}";
		const tagId = "dsh-webchat/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-webchat";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"attachInput": "jbF1yq_attachInput",
			"button": "jbF1yq_button",
			"buttonDanger": "jbF1yq_buttonDanger",
			"buttonGhost": "jbF1yq_buttonGhost",
			"buttonPrimary": "jbF1yq_buttonPrimary",
			"citation": "jbF1yq_citation",
			"composer": "jbF1yq_composer",
			"composerFooter": "jbF1yq_composerFooter",
			"composerHint": "jbF1yq_composerHint",
			"composerInput": "jbF1yq_composerInput",
			"composerSpacer": "jbF1yq_composerSpacer",
			"composerToolbar": "jbF1yq_composerToolbar",
			"dshWcPulse": "jbF1yq_dshWcPulse",
			"dshWcToast": "jbF1yq_dshWcToast",
			"emptyBody": "jbF1yq_emptyBody",
			"emptyEyebrow": "jbF1yq_emptyEyebrow",
			"emptyState": "jbF1yq_emptyState",
			"emptyTitle": "jbF1yq_emptyTitle",
			"entry": "jbF1yq_entry",
			"entryIcon": "jbF1yq_entryIcon",
			"entryLabel": "jbF1yq_entryLabel",
			"handoffDock": "jbF1yq_handoffDock",
			"handoffEyebrow": "jbF1yq_handoffEyebrow",
			"handoffSpacer": "jbF1yq_handoffSpacer",
			"headerSpacer": "jbF1yq_headerSpacer",
			"main": "jbF1yq_main",
			"markdown": "jbF1yq_markdown",
			"messageBubble": "jbF1yq_messageBubble",
			"messageError": "jbF1yq_messageError",
			"messageList": "jbF1yq_messageList",
			"messageMeta": "jbF1yq_messageMeta",
			"messageRow": "jbF1yq_messageRow",
			"messageSpeaker": "jbF1yq_messageSpeaker",
			"messageTime": "jbF1yq_messageTime",
			"panel": "jbF1yq_panel",
			"panelBody": "jbF1yq_panelBody",
			"panelHeader": "jbF1yq_panelHeader",
			"panelTitle": "jbF1yq_panelTitle",
			"recoverEmpty": "jbF1yq_recoverEmpty",
			"recoverItem": "jbF1yq_recoverItem",
			"recoverList": "jbF1yq_recoverList",
			"recoverTitle": "jbF1yq_recoverTitle",
			"segmented": "jbF1yq_segmented",
			"segmentedButton": "jbF1yq_segmentedButton",
			"sidebar": "jbF1yq_sidebar",
			"sidebarAction": "jbF1yq_sidebarAction",
			"sidebarActionDanger": "jbF1yq_sidebarActionDanger",
			"sidebarActions": "jbF1yq_sidebarActions",
			"sidebarClear": "jbF1yq_sidebarClear",
			"sidebarEmpty": "jbF1yq_sidebarEmpty",
			"sidebarItem": "jbF1yq_sidebarItem",
			"sidebarList": "jbF1yq_sidebarList",
			"sidebarMeta": "jbF1yq_sidebarMeta",
			"sidebarNew": "jbF1yq_sidebarNew",
			"sidebarRename": "jbF1yq_sidebarRename",
			"sidebarRenameInput": "jbF1yq_sidebarRenameInput",
			"sidebarRow": "jbF1yq_sidebarRow",
			"sidebarTitle": "jbF1yq_sidebarTitle",
			"statusChip": "jbF1yq_statusChip",
			"statusDot": "jbF1yq_statusDot",
			"statusText": "jbF1yq_statusText",
			"streamBadge": "jbF1yq_streamBadge",
			"tableWrap": "jbF1yq_tableWrap",
			"toast": "jbF1yq_toast",
			"toggleButton": "jbF1yq_toggleButton",
			"view": "jbF1yq_view",
			"workspaceSelect": "jbF1yq_workspaceSelect"
		};
		//#endregion
		//#region src/client/panel/Markdown.tsx
		/**
		* Minimal markdown renderer for the web-chat panel. Deliberately small and
		* dependency-free: headings, paragraphs, bold/italic, inline + fenced code,
		* links, DeepSeek `[citation:N]` markers (rendered as superscript badges),
		* unordered/ordered lists, blockquotes, GFM tables, horizontal rules, and
		* <details> passthrough (used for DeepSeek R1 thinking blocks). Anything
		* unrecognized renders as plain text — never raw HTML.
		*/
		/** Escape text for safe rendering (no dangerouslySetInnerHTML anywhere). */
		function esc(text) {
			return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}
		/**
		* Inline markdown → React nodes. Single tokenizer pass over the string:
		* code spans win, then links, then `[citation:…]` markers, then bold, then
		* italic — each non-token run is escaped text. Bold/italic recurse so a
		* strong span can contain a citation or link.
		*/
		function inline(text, keyBase = "i") {
			const nodes = [];
			const re = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\[citation:[^\]]+\])|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\n]+\*|_[^_\n]+_)/g;
			let last = 0;
			let index = 0;
			let match;
			while ((match = re.exec(text)) !== null) {
				if (match.index > last) nodes.push(esc(text.slice(last, match.index)));
				const key = `${keyBase}-${index}`;
				if (match[1] !== void 0) nodes.push((0, react.createElement)("code", { key: `${key}-code` }, match[1].slice(1, -1)));
				else if (match[2] !== void 0) {
					const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(match[2]);
					nodes.push((0, react.createElement)("a", {
						key: `${key}-a`,
						href: link[2],
						target: "_blank",
						rel: "noreferrer"
					}, link[1]));
				} else if (match[3] !== void 0) {
					const nums = match[3].slice(10, -1).trim();
					nodes.push((0, react.createElement)("sup", {
						key: `${key}-cite`,
						className: panel_module_css_default.citation
					}, nums));
				} else if (match[4] !== void 0) {
					const inner = match[4].slice(2, -2);
					nodes.push((0, react.createElement)("strong", { key: `${key}-b` }, ...inline(inner, `${key}-b`)));
				} else if (match[5] !== void 0) {
					const inner = match[5].slice(1, -1);
					nodes.push((0, react.createElement)("em", { key: `${key}-i` }, ...inline(inner, `${key}-i`)));
				}
				last = re.lastIndex;
				index++;
			}
			if (last < text.length) nodes.push(esc(text.slice(last)));
			return nodes;
		}
		/** One fenced code block → <pre><code>. */
		function codeBlock(language, body, key) {
			return (0, react.createElement)("pre", { key }, (0, react.createElement)("code", { className: language === "" ? void 0 : `language-${language}` }, body));
		}
		/** Split a table row into cells, honoring escaped pipes (\|). */
		function splitCells(line) {
			const cells = [];
			let current = "";
			let escaped = false;
			for (const ch of line) if (escaped) {
				current += ch;
				escaped = false;
			} else if (ch === "\\") escaped = true;
			else if (ch === "|") {
				cells.push(current);
				current = "";
			} else current += ch;
			cells.push(current);
			let start = 0;
			let end = cells.length;
			while (start < end && cells[start].trim() === "") start++;
			while (end > start && cells[end - 1].trim() === "") end--;
			return cells.slice(start, end).map((cell) => cell.trim());
		}
		/** True when a line is a GFM table delimiter row (`:---`, `---:`, `:---:`, …). */
		function isDelimiterRow(line) {
			const cells = splitCells(line);
			return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
		}
		/** Render one block of markdown text into React nodes. */
		function renderMarkdown(source) {
			const raw = source.replace(/\r\n/g, "\n").trim();
			if (raw === "") return [];
			const blocks = [];
			const lines = raw.split("\n");
			let index = 0;
			let blockIndex = 0;
			const push = (node) => {
				blocks.push((0, react.createElement)("div", { key: `b${blockIndex++}` }, node));
			};
			while (index < lines.length) {
				const line = lines[index];
				const trimmed = line.trim();
				const fence = /^```([\w+-]*)\s*$/.exec(trimmed);
				if (fence !== null) {
					const language = fence[1] ?? "";
					const body = [];
					index++;
					while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
						body.push(lines[index]);
						index++;
					}
					index++;
					push(codeBlock(language, body.join("\n"), `code${blockIndex}`));
					continue;
				}
				const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
				if (heading !== null) {
					const level = heading[1].length;
					push((0, react.createElement)(`h${level}`, null, ...inline(heading[2], `h${blockIndex}`)));
					index++;
					continue;
				}
				if (line.includes("|") && lines[index + 1] !== void 0 && isDelimiterRow(lines[index + 1])) {
					const header = splitCells(line);
					index += 2;
					const rows = [];
					while (index < lines.length) {
						const row = lines[index];
						if (row.trim() === "" || !row.includes("|")) break;
						rows.push(splitCells(row));
						index++;
					}
					const width = Math.max(header.length, ...rows.map((row) => row.length));
					const rowNode = (cells, rowIndex) => (0, react.createElement)("tr", { key: rowIndex }, Array.from({ length: width }, (_, col) => (0, react.createElement)("td", { key: col }, ...inline(cells[col] ?? "", `t${blockIndex}-${rowIndex}-${col}`))));
					blocks.push((0, react.createElement)("div", {
						key: `tw${blockIndex}`,
						className: panel_module_css_default.tableWrap
					}, (0, react.createElement)("table", { key: `t${blockIndex}` }, (0, react.createElement)("thead", null, (0, react.createElement)("tr", null, header.map((cell, col) => (0, react.createElement)("th", { key: col }, ...inline(cell, `th${blockIndex}-${col}`))))), (0, react.createElement)("tbody", null, rows.map(rowNode)))));
					blockIndex++;
					continue;
				}
				if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
					push((0, react.createElement)("hr", { key: `hr${blockIndex}` }));
					index++;
					continue;
				}
				if (trimmed.startsWith(">")) {
					const quote = [];
					while (index < lines.length && lines[index].trim().startsWith(">")) {
						quote.push(lines[index].trim().replace(/^>\s?/, ""));
						index++;
					}
					push((0, react.createElement)("blockquote", { key: `q${blockIndex}` }, ...renderMarkdown(quote.join("\n"))));
					continue;
				}
				if (/^<details>/.test(trimmed)) {
					const body = [];
					const summaryMatch = /^<summary>\s*(.*?)\s*<\/summary>/.exec(trimmed);
					index++;
					while (index < lines.length && !/^<\/details>/.test(lines[index].trim())) {
						body.push(lines[index]);
						index++;
					}
					index++;
					push((0, react.createElement)("details", { key: `d${blockIndex}` }, (0, react.createElement)("summary", null, summaryMatch?.[1] ?? "详情"), ...renderMarkdown(body.join("\n"))));
					continue;
				}
				if (/^[-*+]\s+/.test(trimmed)) {
					const items = [];
					while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
						items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
						index++;
					}
					push((0, react.createElement)("ul", { key: `ul${blockIndex}` }, items.map((item, itemIndex) => (0, react.createElement)("li", { key: itemIndex }, ...inline(item, `uli${blockIndex}-${itemIndex}`)))));
					continue;
				}
				if (/^\d+[.)]\s+/.test(trimmed)) {
					const items = [];
					while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
						items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""));
						index++;
					}
					push((0, react.createElement)("ol", { key: `ol${blockIndex}` }, items.map((item, itemIndex) => (0, react.createElement)("li", { key: itemIndex }, ...inline(item, `oli${blockIndex}-${itemIndex}`)))));
					continue;
				}
				const paragraph = [];
				while (index < lines.length) {
					const current = lines[index].trim();
					if (current === "") break;
					if (/^(```|#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|<\/(details|table)>)/.test(current)) break;
					if (current.includes("|") && lines[index + 1] !== void 0 && isDelimiterRow(lines[index + 1])) break;
					paragraph.push(current);
					index++;
				}
				if (paragraph.length === 0) {
					index++;
					continue;
				}
				push((0, react.createElement)("p", { key: `p${blockIndex}` }, ...inline(paragraph.join(" "), `p${blockIndex}`)));
			}
			return blocks;
		}
		/** The markdown renderer component. */
		function Markdown({ source }) {
			return (0, react.createElement)("div", { className: panel_module_css_default.markdown }, ...renderMarkdown(source));
		}
		//#endregion
		//#region src/client/panel/WebChatPanel.tsx
		/**
		* The web-chat panel: engine/login status, a conversation sidebar (the local
		* transcript list + management), the chat transcript with markdown rendering,
		* streaming updates (polled), the composer with deep-think / internet-search
		* toggles, and the transfer-to-Harness handoff. All data flows through the
		* /api/dsh-webchat routes; the panel is a plain React root in the center column.
		*
		* Layout mirrors chat.deepseek.com: a left conversation sidebar (new chat +
		* history + per-item rename/delete + clear-all) beside the main chat column
		* (messages → composer with 深度思考 / 智能搜索 toggles → handoff dock). The
		* mono register stays reserved for machine things — timestamps, counts,
		* status, and the handoff eyebrow.
		*/
		/** Interpolate {placeholder}s in a localized template. */
		function fmt(template, values) {
			return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
		}
		/** Compact inline icons (stroke = currentColor, 16px viewBox). */
		const PENCIL_ICON = "<svg viewBox=\"0 0 16 16\" width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M11.3 2.2l2.5 2.5L5.5 13H3v-2.5L11.3 2.2z\"/></svg>";
		const TRASH_ICON = "<svg viewBox=\"0 0 16 16\" width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2.5 4h11M6.5 4V2.5h3V4M4 4l.5 9.5h7L12 4\"/></svg>";
		const CHECK_ICON = "<svg viewBox=\"0 0 16 16\" width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 8.5L6.5 12 13 4.5\"/></svg>";
		const CROSS_ICON = "<svg viewBox=\"0 0 16 16\" width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 4l8 8M12 4l-8 8\"/></svg>";
		/** Time between /state polls while nothing is streaming. */
		const POLL_IDLE_MS = 1500;
		/** Faster polling while a reply is streaming. */
		const POLL_STREAM_MS = 600;
		function WebChatPanel({ api, tt, sessions, workspaces, currentCwd }) {
			const [state, setState] = (0, react.useState)(null);
			const [viewChatId, setViewChatId] = (0, react.useState)(void 0);
			const [draft, setDraft] = (0, react.useState)("");
			const [attachOpen, setAttachOpen] = (0, react.useState)(false);
			const [imagePaths, setImagePaths] = (0, react.useState)("");
			const [toast, setToast] = (0, react.useState)(null);
			const [transferring, setTransferring] = (0, react.useState)(false);
			const [exporting, setExporting] = (0, react.useState)(false);
			const [transferMode, setTransferMode] = (0, react.useState)("distill");
			const [targetWorkspaceId, setTargetWorkspaceId] = (0, react.useState)(void 0);
			const [targetSessionId, setTargetSessionId] = (0, react.useState)(void 0);
			const [deepThink, setDeepThink] = (0, react.useState)(false);
			const [search, setSearch] = (0, react.useState)(false);
			const [renamingId, setRenamingId] = (0, react.useState)(void 0);
			const [renameDraft, setRenameDraft] = (0, react.useState)("");
			const [deleteArmId, setDeleteArmId] = (0, react.useState)(void 0);
			const [clearArm, setClearArm] = (0, react.useState)(false);
			const [recoverOpen, setRecoverOpen] = (0, react.useState)(false);
			const [webMissing, setWebMissing] = (0, react.useState)([]);
			const [recovering, setRecovering] = (0, react.useState)(false);
			const listRef = (0, react.useRef)(null);
			const toastTimer = (0, react.useRef)(void 0);
			const armTimer = (0, react.useRef)(void 0);
			const stateRef = (0, react.useRef)(null);
			stateRef.current = state;
			const pinnedRef = (0, react.useRef)(true);
			const prevChatRef = (0, react.useRef)(void 0);
			const showToast = (0, react.useCallback)((text, error = false) => {
				setToast({
					text,
					error
				});
				window.clearTimeout(toastTimer.current);
				toastTimer.current = window.setTimeout(() => setToast(null), 5e3);
			}, []);
			const workspaceSnapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => workspaces.list.subscribe(listener), [workspaces]), () => workspaces.list.getSnapshot());
			const workspaceItems = workspaceSnapshot.items;
			const workspaceBaselinesReady = workspaceSnapshot.baselinesReady;
			const sessionSnapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => sessions.list.subscribe(listener), [sessions]), () => sessions.list.getSnapshot());
			const selectedWorkspace = targetWorkspaceId === void 0 ? void 0 : workspaceItems.find((ws) => ws.workspaceId === targetWorkspaceId);
			const groupedSessionIds = new Set(workspaceItems.flatMap((ws) => ws.sessionIds));
			const continuationTargets = sessionSnapshot.ids.flatMap((id) => {
				const session = sessionSnapshot.byId[id];
				if (session === void 0 || session.blank === true) return [];
				if (selectedWorkspace !== void 0) {
					if (!selectedWorkspace.sessionIds.includes(id)) return [];
				} else if (groupedSessionIds.has(id)) return [];
				return [{
					sessionId: session.id,
					title: session.displayTitle,
					running: session.running
				}];
			});
			const workspaceOverridden = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (workspaceOverridden.current || !workspaceBaselinesReady) return;
				const currentSessionId = sessions.list.getSnapshot().current;
				const currentWorkspace = currentSessionId === void 0 ? void 0 : workspaceItems.find((ws) => ws.sessionIds.includes(currentSessionId));
				setTargetWorkspaceId(currentWorkspace?.workspaceId ?? workspaceSnapshot.recentWorkspaceId);
			}, [
				workspaceBaselinesReady,
				workspaceItems,
				workspaceSnapshot.recentWorkspaceId,
				sessions
			]);
			const creatingWorkspace = (0, react.useRef)(false);
			const createWorkspace = (0, react.useCallback)(async () => {
				if (creatingWorkspace.current) return;
				creatingWorkspace.current = true;
				try {
					const path = await workspaces.pickDirectory();
					if (path === null || path === "") return;
					const created = await workspaces.create({ path });
					setTargetWorkspaceId(created.workspaceId);
					showToast(fmt(tt("transfer.workspace.created"), { title: created.title }));
				} catch (error) {
					showToast(fmt(tt("transfer.workspace.createFailed"), { error: String(error) }), true);
				} finally {
					creatingWorkspace.current = false;
				}
			}, [
				workspaces,
				showToast,
				tt
			]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				let timer;
				const poll = async () => {
					if (cancelled) return;
					try {
						const snapshot = await api.state();
						if (cancelled) return;
						setState(snapshot);
						setViewChatId((previous) => {
							const active = snapshot.activeChatId;
							if (previous !== void 0 && snapshot.chats.some((chat) => chat.id === previous)) return previous;
							return active;
						});
					} catch {}
					const streaming = stateRef.current?.chats.some((chat) => chat.streaming) ?? false;
					timer = window.setTimeout(poll, streaming ? POLL_STREAM_MS : POLL_IDLE_MS);
				};
				poll();
				return () => {
					cancelled = true;
					window.clearTimeout(timer);
				};
			}, [api]);
			(0, react.useEffect)(() => {
				if (state === null) return;
				setDeepThink(state.deepThink);
				setSearch(state.search);
			}, [state?.deepThink, state?.search]);
			(0, react.useEffect)(() => {
				const list = listRef.current;
				if (list === null) return;
				const switched = prevChatRef.current !== viewChatId;
				prevChatRef.current = viewChatId;
				if (switched || pinnedRef.current) list.scrollTop = list.scrollHeight;
			}, [state, viewChatId]);
			const handleScroll = (0, react.useCallback)(() => {
				const list = listRef.current;
				if (list === null) return;
				const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
				pinnedRef.current = nearBottom;
			}, []);
			const chats = state?.chats ?? [];
			const viewChat = chats.find((chat) => chat.id === viewChatId) ?? chats[0];
			const busy = state?.busy ?? false;
			const loggedIn = state?.loggedIn ?? null;
			const streaming = viewChat?.streaming ?? false;
			const modelLabel = (0, react.useCallback)((model) => {
				return model === "deepseek-reasoner" ? tt("model.deepseek-reasoner") : tt("model.deepseek-chat");
			}, [tt]);
			const send = (0, react.useCallback)(async () => {
				const text = draft.trim();
				const images = imagePaths.split(/[\n,;]+/).map((path) => path.trim()).filter((path) => path !== "");
				if (text === "" && images.length === 0 || busy) return;
				setDraft("");
				setImagePaths("");
				pinnedRef.current = true;
				try {
					const result = await api.send(text, images.length > 0 ? images : void 0);
					if (result.ok !== true) showToast(result.error ?? "send failed", true);
					else setViewChatId(result.chatId);
				} catch (error) {
					showToast(String(error), true);
				}
			}, [
				draft,
				imagePaths,
				busy,
				api,
				showToast
			]);
			const stop = (0, react.useCallback)(async () => {
				await api.stop().catch(() => void 0);
			}, [api]);
			const newChat = (0, react.useCallback)(async () => {
				try {
					const result = await api.newChat();
					if (result.ok === true && result.chatId !== void 0) setViewChatId(result.chatId);
					else showToast(result.error ?? "new chat failed", true);
				} catch (error) {
					showToast(String(error), true);
				}
			}, [api, showToast]);
			const toggleDeepThink = (0, react.useCallback)(async () => {
				const next = !deepThink;
				setDeepThink(next);
				try {
					const result = await api.setDeepThink(next);
					if (result.ok !== true) showToast(result.error ?? "toggle deep think failed", true);
				} catch (error) {
					showToast(String(error), true);
				}
			}, [
				deepThink,
				api,
				showToast
			]);
			const toggleSearch = (0, react.useCallback)(async () => {
				const next = !search;
				setSearch(next);
				try {
					const result = await api.setSearch(next);
					if (result.ok !== true) showToast(result.error ?? "toggle search failed", true);
				} catch (error) {
					showToast(String(error), true);
				}
			}, [
				search,
				api,
				showToast
			]);
			const openLogin = (0, react.useCallback)(async () => {
				try {
					const result = await api.openLogin();
					if (result.ok !== true) showToast(result.error ?? "open login failed", true);
				} catch (error) {
					showToast(String(error), true);
				}
			}, [api, showToast]);
			const closeBrowser = (0, react.useCallback)(async () => {
				await api.closeBrowser().catch(() => void 0);
			}, [api]);
			const toggleRecover = (0, react.useCallback)(async () => {
				if (recoverOpen) {
					setRecoverOpen(false);
					return;
				}
				try {
					const result = await api.webChats();
					setWebMissing(result.ok === true ? result.missing ?? [] : []);
					setRecoverOpen(true);
				} catch (error) {
					showToast(String(error), true);
				}
			}, [
				recoverOpen,
				api,
				showToast
			]);
			const recoverFromWeb = (0, react.useCallback)(async (title) => {
				if (recovering) return;
				setRecovering(true);
				try {
					const result = await api.recover(title);
					if (result.ok !== true || result.chatId === void 0) {
						showToast(result.error ?? "recover failed", true);
						return;
					}
					setWebMissing((list) => list.filter((item) => item !== title));
					showToast(fmt(tt("recover.done"), { title: result.title ?? title }));
				} catch (error) {
					showToast(String(error), true);
				} finally {
					setRecovering(false);
				}
			}, [
				recovering,
				api,
				showToast,
				tt
			]);
			const transferToHarness = (0, react.useCallback)(async () => {
				if (viewChat === void 0 || transferring) return;
				setTransferring(true);
				try {
					const result = await api.transfer(viewChat.id, currentCwd(), transferMode, targetWorkspaceId, targetSessionId);
					if (result.ok !== true || result.sessionId === void 0) {
						showToast(result.error ?? "transfer failed", true);
						return;
					}
					const target = result.sessionId;
					if (result.continued === true) {
						showToast(fmt(tt("transfer.continued"), { sessionId: target }));
						sessions.open(target);
						return;
					}
					if (result.attached === false && targetWorkspaceId !== void 0) showToast(fmt(tt("transfer.attached.failed"), { sessionId: target }), true);
					else showToast(fmt(tt("transfer.done"), { sessionId: target }));
					const refreshable = sessions;
					try {
						await refreshable.refresh?.();
					} catch {}
					const tryOpen = () => {
						if (sessions.list.getSnapshot().byId[target] !== void 0) {
							sessions.open(target);
							return;
						}
						window.setTimeout(tryOpen, 300);
					};
					window.setTimeout(tryOpen, 200);
				} catch (error) {
					showToast(String(error), true);
				} finally {
					setTransferring(false);
				}
			}, [
				viewChat,
				transferring,
				api,
				currentCwd,
				sessions,
				showToast,
				tt,
				transferMode,
				targetWorkspaceId,
				targetSessionId
			]);
			const exportFile = (0, react.useCallback)(async () => {
				if (viewChat === void 0 || exporting) return;
				setExporting(true);
				try {
					const result = await api.exportFile(viewChat.id, currentCwd());
					if (result.ok !== true || result.filePath === void 0) showToast(result.error ?? "export failed", true);
					else showToast(fmt(tt("export.done"), { filePath: result.filePath }));
				} catch (error) {
					showToast(String(error), true);
				} finally {
					setExporting(false);
				}
			}, [
				viewChat,
				exporting,
				api,
				currentCwd,
				showToast,
				tt
			]);
			const resetArmTimer = (0, react.useCallback)((next) => {
				window.clearTimeout(armTimer.current);
				armTimer.current = next === void 0 ? void 0 : window.setTimeout(next, 3e3);
			}, []);
			const startRename = (0, react.useCallback)((chat) => {
				setDeleteArmId(void 0);
				setClearArm(false);
				setRenameDraft(chat.title);
				setRenamingId(chat.id);
			}, []);
			const commitRename = (0, react.useCallback)(async () => {
				const id = renamingId;
				if (id === void 0) return;
				const title = renameDraft.trim().replace(/\s+/g, " ");
				setRenamingId(void 0);
				const original = chats.find((chat) => chat.id === id);
				if (title === "" || original !== void 0 && title === original.title) return;
				try {
					const result = await api.renameChat(id, title);
					if (result.ok !== true) showToast(fmt(tt("toast.rename.failed"), { error: result.error ?? "" }), true);
					else showToast(tt("toast.rename.done"));
				} catch (error) {
					showToast(fmt(tt("toast.rename.failed"), { error: String(error) }), true);
				}
			}, [
				renamingId,
				renameDraft,
				chats,
				api,
				showToast,
				tt
			]);
			const cancelRename = (0, react.useCallback)(() => {
				setRenamingId(void 0);
				setRenameDraft("");
			}, []);
			const requestDelete = (0, react.useCallback)(async (id) => {
				if (deleteArmId !== id) {
					setClearArm(false);
					setRenamingId(void 0);
					setDeleteArmId(id);
					resetArmTimer(() => setDeleteArmId(void 0));
					return;
				}
				resetArmTimer(void 0);
				setDeleteArmId(void 0);
				try {
					const result = await api.deleteChat(id);
					if (result.ok !== true) showToast(fmt(tt("toast.delete.failed"), { error: result.error ?? "" }), true);
					else showToast(tt("toast.delete.done"));
				} catch (error) {
					showToast(fmt(tt("toast.delete.failed"), { error: String(error) }), true);
				}
			}, [
				deleteArmId,
				api,
				showToast,
				tt,
				resetArmTimer
			]);
			const requestClear = (0, react.useCallback)(async () => {
				if (chats.length === 0) return;
				if (!clearArm) {
					setDeleteArmId(void 0);
					setRenamingId(void 0);
					setClearArm(true);
					resetArmTimer(() => setClearArm(false));
					return;
				}
				resetArmTimer(void 0);
				setClearArm(false);
				try {
					const result = await api.clearChats();
					if (result.ok !== true) showToast(fmt(tt("toast.clear.failed"), { error: result.error ?? "" }), true);
					else showToast(tt("toast.clear.done"));
				} catch (error) {
					showToast(fmt(tt("toast.clear.failed"), { error: String(error) }), true);
				}
			}, [
				chats.length,
				clearArm,
				api,
				showToast,
				tt,
				resetArmTimer
			]);
			const engineState = state?.engine ?? "stopped";
			const engineError = state?.engineError;
			const statusDot = busy ? "busy" : engineState === "error" ? "bad" : loggedIn === true ? "ok" : "warn";
			const statusText = busy ? tt("composer.busy") : engineState === "error" ? `${tt("status.engine.error")}${engineError !== void 0 ? `: ${engineError}` : ""}` : engineState === "launching" ? tt("status.engine.launching") : loggedIn === true ? tt("status.loggedIn") : loggedIn === false ? tt("status.notLoggedIn") : tt("status.unknown");
			const togglesDisabled = busy || loggedIn !== true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: panel_module_css_default.panelHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: panel_module_css_default.panelTitle,
								children: tt("panel.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.headerSpacer }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.statusChip,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.statusDot,
									"data-state": statusDot
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.statusText,
									children: statusText
								})]
							}),
							loggedIn !== true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
								onClick: () => {
									openLogin();
								},
								children: tt("action.openLogin")
							}),
							engineState !== "stopped" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.buttonGhost,
								onClick: () => {
									closeBrowser();
								},
								children: tt("action.closeBrowser")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.panelBody,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
							className: panel_module_css_default.sidebar,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary} ${panel_module_css_default.sidebarNew}`,
									onClick: () => {
										newChat();
									},
									children: tt("action.newChat")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: `${panel_module_css_default.buttonGhost} ${panel_module_css_default.sidebarNew}`,
									disabled: loggedIn !== true,
									onClick: () => {
										toggleRecover();
									},
									title: tt("recover.hint"),
									children: tt("action.recover")
								}),
								recoverOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.recoverList,
									children: webMissing.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.recoverEmpty,
										children: tt("recover.empty")
									}) : webMissing.map((title) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.recoverItem,
										disabled: recovering,
										onClick: () => {
											recoverFromWeb(title);
										},
										title,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.recoverTitle,
											children: title
										})
									}, title))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.sidebarList,
									children: chats.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.sidebarEmpty,
										children: tt("sidebar.empty")
									}) : chats.map((chat) => renamingId === chat.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.sidebarItem,
										"data-active": chat.id === viewChatId ? "true" : void 0,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.sidebarRename,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: panel_module_css_default.sidebarRenameInput,
													value: renameDraft,
													placeholder: tt("chat.rename.placeholder"),
													"aria-label": "rename",
													autoFocus: true,
													onChange: (event) => setRenameDraft(event.target.value),
													onKeyDown: (event) => {
														if (event.key === "Enter") {
															event.preventDefault();
															commitRename();
														} else if (event.key === "Escape") cancelRename();
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: panel_module_css_default.sidebarAction,
													onClick: () => {
														commitRename();
													},
													"aria-label": tt("chat.rename.ok"),
													dangerouslySetInnerHTML: { __html: CHECK_ICON }
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: panel_module_css_default.sidebarAction,
													onClick: cancelRename,
													"aria-label": tt("chat.rename.cancel"),
													dangerouslySetInnerHTML: { __html: CROSS_ICON }
												})
											]
										})
									}, chat.id) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.sidebarItem,
										"data-active": chat.id === viewChatId ? "true" : void 0,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: panel_module_css_default.sidebarRow,
											onClick: () => setViewChatId(chat.id),
											title: chat.title,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.sidebarTitle,
												children: chat.title
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.sidebarMeta,
												children: fmt(tt("chats.count"), { count: String(chat.messages.length) })
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.sidebarActions,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.sidebarAction,
												onClick: () => startRename(chat),
												"aria-label": tt("chat.rename"),
												title: tt("chat.rename"),
												dangerouslySetInnerHTML: { __html: PENCIL_ICON }
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: deleteArmId === chat.id ? panel_module_css_default.sidebarActionDanger : panel_module_css_default.sidebarAction,
												onClick: () => {
													requestDelete(chat.id);
												},
												"aria-label": deleteArmId === chat.id ? tt("chat.delete.confirm") : tt("chat.delete"),
												title: deleteArmId === chat.id ? tt("chat.delete.confirm") : tt("chat.delete"),
												children: deleteArmId === chat.id ? tt("chat.delete.confirm") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { dangerouslySetInnerHTML: { __html: TRASH_ICON } })
											})]
										})]
									}, chat.id))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: clearArm ? `${panel_module_css_default.button} ${panel_module_css_default.buttonDanger} ${panel_module_css_default.sidebarClear}` : `${panel_module_css_default.buttonGhost} ${panel_module_css_default.sidebarClear}`,
									disabled: chats.length === 0,
									onClick: () => {
										requestClear();
									},
									children: clearArm ? tt("chat.clearAll.confirm") : tt("chat.clearAll")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.main,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.messageList,
									ref: listRef,
									onScroll: handleScroll,
									children: viewChat === void 0 || viewChat.messages.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.emptyState,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: panel_module_css_default.emptyEyebrow,
												children: tt("empty.eyebrow")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
												className: panel_module_css_default.emptyTitle,
												children: tt("empty.title")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: panel_module_css_default.emptyBody,
												children: tt("empty.body")
											}),
											loggedIn !== true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
												onClick: () => {
													openLogin();
												},
												children: tt("action.openLogin")
											})
										]
									}) : viewChat.messages.map((message) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.messageRow,
										"data-role": message.role,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.messageMeta,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.messageSpeaker,
													children: message.role === "user" ? tt("role.you") : modelLabel(viewChat.model)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.messageTime,
													children: new Date(message.ts).toLocaleTimeString()
												}),
												message.streaming === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.streamBadge,
													children: [tt("streaming"), "…"]
												})
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.messageBubble,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Markdown, { source: message.content }), message.error !== void 0 && message.content !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: panel_module_css_default.messageError,
												children: fmt(tt("msg.error"), { error: message.error })
											})]
										})]
									}, message.id))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.composer,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.composerToolbar,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.toggleButton,
												"data-active": deepThink ? "true" : void 0,
												disabled: togglesDisabled,
												title: tt("toggle.deepThink.hint"),
												"aria-pressed": deepThink,
												onClick: () => {
													toggleDeepThink();
												},
												children: tt("toggle.deepThink")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.toggleButton,
												"data-active": search ? "true" : void 0,
												disabled: togglesDisabled,
												title: tt("toggle.search.hint"),
												"aria-pressed": search,
												onClick: () => {
													toggleSearch();
												},
												children: tt("toggle.search")
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											className: panel_module_css_default.composerInput,
											value: draft,
											placeholder: busy ? tt("composer.busy") : loggedIn !== true ? tt("composer.notLoggedIn") : tt("composer.placeholder"),
											disabled: busy || loggedIn !== true,
											onChange: (event) => setDraft(event.target.value),
											onKeyDown: (event) => {
												if (event.key === "Enter" && !event.shiftKey) {
													event.preventDefault();
													send();
												}
											}
										}),
										attachOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: panel_module_css_default.attachInput,
											value: imagePaths,
											placeholder: tt("composer.attach.placeholder"),
											disabled: busy || loggedIn !== true,
											onChange: (event) => setImagePaths(event.target.value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.composerFooter,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: panel_module_css_default.toggleButton,
													"data-active": attachOpen ? "true" : void 0,
													title: tt("composer.attach.hint"),
													"aria-pressed": attachOpen,
													disabled: busy || loggedIn !== true,
													onClick: () => setAttachOpen((open) => !open),
													children: tt("composer.attach")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.composerHint,
													children: tt("composer.hint")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.composerSpacer }),
												streaming ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonDanger}`,
													onClick: () => {
														stop();
													},
													children: tt("action.stop")
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
													disabled: busy || loggedIn !== true || draft.trim() === "" && imagePaths.trim() === "",
													onClick: () => {
														send();
													},
													children: tt("action.send")
												})
											]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.handoffDock,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.handoffEyebrow,
											children: tt("handoff.eyebrow")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.handoffSpacer }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.segmented,
											role: "group",
											"aria-label": "transfer mode",
											title: tt("transfer.mode.hint"),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.segmentedButton,
												"data-active": transferMode === "distill" ? "true" : void 0,
												onClick: () => setTransferMode("distill"),
												children: tt("transfer.mode.distill")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: panel_module_css_default.segmentedButton,
												"data-active": transferMode === "raw" ? "true" : void 0,
												onClick: () => setTransferMode("raw"),
												children: tt("transfer.mode.raw")
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: panel_module_css_default.workspaceSelect,
											value: targetSessionId ?? "",
											disabled: continuationTargets.length === 0,
											title: tt("transfer.session.hint"),
											"aria-label": tt("transfer.session.label"),
											onChange: (event) => setTargetSessionId(event.target.value === "" ? void 0 : event.target.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: tt("transfer.session.new")
											}), continuationTargets.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
												value: session.sessionId,
												children: [session.title, session.running === true ? " ·●" : ""]
											}, session.sessionId))]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: panel_module_css_default.workspaceSelect,
											value: targetWorkspaceId ?? "",
											disabled: targetSessionId !== void 0,
											title: tt("transfer.workspace.hint"),
											"aria-label": tt("transfer.workspace.label"),
											onChange: (event) => {
												workspaceOverridden.current = true;
												setTargetWorkspaceId(event.target.value === "" ? void 0 : event.target.value);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: tt("transfer.workspace.ungrouped")
											}), workspaceItems.map((ws) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
												value: ws.workspaceId,
												children: [ws.title, ws.path !== ws.title ? ` — ${ws.path}` : ""]
											}, ws.workspaceId))]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.buttonGhost,
											onClick: () => {
												createWorkspace();
											},
											title: tt("transfer.workspace.new"),
											disabled: targetSessionId !== void 0,
											children: tt("transfer.workspace.new")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
											disabled: viewChat === void 0 || transferring,
											onClick: () => {
												transferToHarness();
											},
											children: tt("action.transferToHarness")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: panel_module_css_default.button,
											disabled: viewChat === void 0 || exporting,
											onClick: () => {
												exportFile();
											},
											children: tt("action.exportFile")
										})
									]
								})
							]
						})]
					}),
					toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.toast,
						"data-error": toast.error === true ? "true" : void 0,
						children: toast.text
					})
				]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/**
		* Panel view mounting. The conversation slot is single-occupant and external
		* plugins cannot declare slots, so the panel takes over the center column at
		* the DOM level (same strategy as dsh-ssh / dsh-task-board): a container is
		* appended inside the center column as an extra trailing child React never
		* manages, and a stylesheet rule hides the conversation content while the
		* panel is active. Toggling is a data attribute on <html> — no React
		* involvement, so the conversation subtree underneath stays mounted and
		* stateful.
		*/
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"]";
		const ACTIVE_ATTR = "data-dsh-webchat-active";
		/** The sibling panels' activation attributes, removed when this panel opens. */
		const OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		/** Cross-plugin activation event; detail is the activating panel name. */
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const PANEL_NAME = "webchat";
		/** Find the center column, or undefined while the frame is not mounted. */
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		/**
		* Mount the panel React tree into the center column and bind its visibility
		* to the controller's panelOpen state.
		* @param deps - sessions, api, controller, locale accessor.
		* @returns disposer unmounting the tree and restoring the column.
		*/
		function mountPanel(deps) {
			const { sessions, workspaces, api, controller, tt, currentCwd } = deps;
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) {
					if (container.isConnected) return;
					root?.unmount();
					root = void 0;
					container.remove();
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshWebchatView = "";
				container.dataset.dshPlugin = "webchat";
				container.className = panel_module_css_default.view;
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WebChatPanel, {
					api,
					tt,
					sessions,
					workspaces,
					currentCwd
				}));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const onOtherActivate = (event) => {
				const detail = event.detail;
				if ((detail === "taskboard" || detail === "ssh") && controller.getSnapshot().panelOpen) controller.close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				if (!controller.getSnapshot().panelOpen) return;
				const target = event.target;
				if (target === null) return;
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
			};
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/sidebar-entry-core.ts
		/** Find the sidebar shell root element, or undefined while not yet mounted. */
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		/** The New Session button: nested in the logo row on current shells, a direct child on legacy shells. */
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** Build the entry row (a detached button; insert once the shell is up). */
		function createEntry(options) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.setAttribute(options.rowAttribute, "");
			if (options.plugin !== void 0) {
				entry.setAttribute("data-dsh-plugin", options.plugin);
				entry.setAttribute("data-dsh-part", "sidebar-entry");
			}
			entry.className = options.css["entry"] ?? "";
			entry.setAttribute("aria-label", options.label());
			if (options.tooltip !== void 0) entry.setAttribute("title", options.tooltip());
			entry.innerHTML = "<span class=\"" + (options.css["entryIcon"] ?? "") + "\">" + options.icon + "</span><span class=\"" + (options.css["entryLabel"] ?? "") + "\">" + options.label() + "</span>";
			entry.addEventListener("click", options.onToggle);
			return entry;
		}
		/** Re-insert the entry after the New Session row (before the browser region). */
		function placeEntry(root, entry, options) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement !== root) {
				const row = button.closest("[class*=\"logoRow\"]");
				const base = row !== null && row.parentElement === root ? row : button;
				const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches(options.familySelectors.join(", ")));
				const anchor = options.position === "before" ? family.length > 0 ? family[0] : base.nextElementSibling : family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
				root.insertBefore(entry, anchor);
			}
			return true;
		}
		/**
		* Mount the sidebar entry, waiting for the shell to render and self-healing
		* on later React re-renders.
		* @param options - the row's attribute/icon/copy/action/ordering configuration.
		* @returns disposer removing the entry and its observers.
		*/
		function mountSidebarEntry$1(options) {
			if (typeof document !== "undefined" && document.querySelector(options.rowSelector) !== null) return () => {};
			const entry = createEntry(options);
			let root;
			let placed = false;
			const tryPlace = () => {
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry, options);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				if (!root.contains(entry)) placed = placeEntry(root, entry, options);
			});
			const unsubscribeActive = options.active === void 0 ? void 0 : (() => {
				const syncActive = () => {
					if (options.active.isOpen()) entry.dataset.active = "true";
					else delete entry.dataset.active;
				};
				const unsubscribe = options.active.subscribe(syncActive);
				syncActive();
				return unsubscribe;
			})();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribeActive?.();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/sidebar-entry.ts
		/** Stable data attribute identifying the injected entry row. */
		const ENTRY_SELECTOR = "[data-dsh-webchat-entry]";
		/** Inline icon (matches the shell's 16px nav-icon look): a chat bubble with a globe dot. */
		const ICON = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 2.5a5.5 5.5 0 0 0-4.7 8.3L2.5 13.5l2.8-.8A5.5 5.5 0 1 0 8 2.5z\"/><circle cx=\"8\" cy=\"8\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/></svg>";
		/**
		* Mount the sidebar entry, waiting for the shell to render and self-healing
		* on later React re-renders.
		* @param deps - controller and copy accessor.
		* @returns disposer removing the entry and its observers.
		*/
		function mountSidebarEntry(deps) {
			return mountSidebarEntry$1({
				rowAttribute: "data-dsh-webchat-entry",
				rowSelector: ENTRY_SELECTOR,
				plugin: "webchat",
				icon: ICON,
				css: panel_module_css_default,
				label: () => deps.tt("entry.label"),
				tooltip: () => deps.tt("entry.tooltip"),
				onToggle: () => {
					deps.controller.toggle();
				},
				position: "after",
				familySelectors: [
					"[data-dsh-taskboard-entry]",
					"[data-dsh-ssh-entry]",
					"[data-dsh-webchat-entry]"
				],
				active: {
					subscribe: (listener) => deps.controller.subscribe(listener),
					isOpen: () => deps.controller.getSnapshot().panelOpen
				}
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace this plugin owns. */
		const NS = "dsh-webchat";
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = [
			"slots",
			"locale",
			"sessions",
			"workspaces"
		];
		/**
		* Mount the web-chat panel.
		* @param ctx - client root context (locale + sessions services).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-webchat: dictionaries");
			const controller = new PanelController();
			const api = new WebChatApi();
			const sessions = ctx.sessions;
			const workspaces = ctx.workspaces;
			const tt = ctx.locale.bind(NS);
			const currentCwd = () => {
				const snapshot = sessions.list.getSnapshot();
				const current = snapshot.current;
				if (current === void 0) return void 0;
				return snapshot.byId[current]?.cwd;
			};
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry({
					controller,
					tt
				}));
				disposers.push(mountPanel({
					sessions,
					workspaces,
					api,
					controller,
					tt,
					currentCwd
				}));
			} catch (error) {
				console.warn("[dsh-webchat] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-webchat: ui mounts");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map