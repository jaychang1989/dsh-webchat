/**
 * dsh-webchat — browser half.
 *
 * One sidebar entry that renders the official chat.deepseek.com web app inside
 * the DSH window, filling the center column like any other full-page view.
 *
 * Both halves of that are **slots**, so the shell owns them:
 *
 *   - `sidebar.panellist` gets an icon and a label; the sidebar owns the button
 *     and selects the main panel whose id matches, which is why this plugin no
 *     longer injects a row into someone else's DOM;
 *   - `main` (keyed by the same id) gets the page. The layout renders only the
 *     selected key, so switching panels is the shell's business and this panel
 *     never has to hide another page or ask to be closed.
 *
 * The page itself is the host's native browser guest, not an iframe: the
 * renderer asks `globalThis.dshDesktop.browser` for a reservation and attaches a
 * `<webview>` whose `src` is `about:blank#<lease>` and whose `partition`
 * matches, which the shell's `will-attach-webview` approves and rewrites with
 * the real web preferences. That is the same channel the built-in side-card
 * browser uses, and it is why `frame-ancestors 'none'` does not apply.
 *
 * The guest element deliberately lives outside the React tree, in a container
 * this plugin owns at the document root. A `<webview>` is destroyed when it
 * leaves the document, so a guest owned by the slot would be torn down and
 * reloaded every time the user looked at another panel. Instead the slot hands
 * this plugin a measured area, and the persistent guest is positioned onto it
 * while this panel is the selected one, and hidden when it is not.
 *
 * React comes from the browser module table; everything else is plain DOM.
 */
window.__ModuleLoader__.load({
	id: "@jaychang1989/dsh-webchat",
	factory: (require) => {
		const React = require("react")
		const h = React.createElement

		/** This plugin's panel id: the sidebar row and the main cell share it. */
		const PANEL_ID = "webchat"
		/** The page this plugin exists to show. */
		const PAGE_URL = "https://chat.deepseek.com/"
		/** Storage identity: one guest partition per identity, per app run. */
		const STORAGE_IDENTITY = "dsh-webchat"
		/** Host route used by the window fallback. */
		const OPEN_ROUTE = "/api/dsh-webchat/open"
		/** Host routes that keep the login alive across restarts. */
		const RESTORE_ROUTE = "/api/dsh-webchat/session/restore"
		const SAVE_ROUTE = "/api/dsh-webchat/session/save"
		/** Host route that opens a link in the system browser (#1). */
		const EXTERNAL_ROUTE = "/api/dsh-webchat/external"
		/** How often the guest's own storage is snapshotted while it is open. */
		const SAVE_INTERVAL_MS = 30000

		const STYLE_ID = "dsh-webchat-style"
		const OVERLAY_ATTR = "data-dsh-webchat-overlay"

		/** Locale at read time, so the label thunk follows the app's language. */
		function localeTag() {
			return String(document.documentElement.getAttribute("lang")
				|| (typeof navigator === "object" ? navigator.language : "")
				|| "").toLowerCase()
		}

		function isChinese() {
			return localeTag().indexOf("zh") === 0
		}

		/** Russian copy for a Russian shell locale (#2); the shell's lang attribute leads. */
		function isRussian() {
			return localeTag().indexOf("ru") === 0
		}

		/**
		 * Every visible string this plugin owns. The row's name is deliberately
		 * the same in every language: it is the product's own name, not a
		 * translation.
		 */
		function copy() {
			if (isChinese()) return {
				label: "Chat DeepSeek",
				failed: "载入失败",
				fallbackNote: "这个 Harness 没有提供原生浏览器访客（桌面端才有），无法在窗口内显示官方页面。",
				fallbackAction: "在窗口中打开",
				fallbackOpened: "已打开 Chat DeepSeek",
				fallbackHanded: "已交给系统默认浏览器打开",
				fallbackFailed: "打开失败",
				refresh: "刷新 DeepSeek 页面",
			}
			if (isRussian()) return {
				label: "Chat DeepSeek",
				failed: "Не удалось загрузить",
				fallbackNote: "В этом Harness нет нативного браузерного гостя (он есть только в настольной версии), поэтому официальную страницу нельзя показать в окне.",
				fallbackAction: "Открыть в отдельном окне",
				fallbackOpened: "Chat DeepSeek открыт",
				fallbackHanded: "Передано браузеру по умолчанию",
				fallbackFailed: "Не удалось открыть",
				refresh: "Обновить DeepSeek",
			}
			return {
				label: "Chat DeepSeek",
				failed: "Could not load it",
				fallbackNote: "This Harness provides no native browser guest (only the desktop app does), so the official page cannot render in the window.",
				fallbackAction: "Open it in a window",
				fallbackOpened: "Chat DeepSeek is open",
				fallbackHanded: "Handed to the system default browser",
				fallbackFailed: "Could not open",
				refresh: "Refresh DeepSeek",
			}
		}

		const CSS = [
			".dsh-wc-host{width:100%;height:100%;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center}",
			"[" + OVERLAY_ATTR + "]{position:fixed;display:none;z-index:40}",
			"[" + OVERLAY_ATTR + "] webview{-webkit-app-region:no-drag;border:0;flex:auto;width:100%;min-width:0;height:100%;min-height:0;display:flex}",

			".dsh-wc-message{max-width:460px;padding:22px;text-align:center;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family)}",
			".dsh-wc-action{margin-top:14px;padding:6px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-elevated);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;font-family:var(--dsw-font-family)}",
			".dsh-wc-action[disabled]{opacity:.55;cursor:progress}",
		].join("\n")

		/**
		 * The desktop shell's browser bridge, when this renderer is the desktop
		 * app's primary frame. A plain web profile exposes only a protocol
		 * version, so the window fallback takes over.
		 */
		const carrier = globalThis.dshDesktop
		const bridge = carrier !== null && typeof carrier === "object" && carrier.protocolVersion === 1
			? carrier.browser
			: undefined

		/**
		 * The only state that outlives a panel mount. `container` and `element`
		 * stay in the document for the whole app run so the guest is never torn
		 * down; the slot only decides where they are shown.
		 */
		let guest = null
		let shortcuts = null
		/** In-flight acquisition, so two mounts cannot reserve two guests. */
		let acquiring = null
		/** Last acquisition failure, if any. */
		let failure = ""

		/** Render any thrown value as a message. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error)
		}

		/**
		 * Inject the stylesheet — and RE-inject it: after a hot swap of this module
		 * the new code used to run under the old CSS, so a geometry change looked
		 * ignored until a window reload (#2). Rewriting the text on every apply
		 * keeps style and behaviour in step.
		 */
		function ensureStyle() {
			let tag = document.getElementById(STYLE_ID)
			if (tag === null) {
				tag = document.createElement("style")
				tag.id = STYLE_ID
				document.head.appendChild(tag)
			}
			tag.textContent = CSS
		}

		/** A centred message, optionally with one action button. */
		function messageBox(text, action) {
			const box = document.createElement("div")
			box.className = "dsh-wc-message"
			box.textContent = text
			if (action !== undefined) {
				const button = document.createElement("button")
				button.type = "button"
				button.className = "dsh-wc-action"
				button.textContent = action.label
				button.addEventListener("click", async function () {
					if (button.disabled) return
					button.disabled = true
					try {
						await action.run(button)
					} finally {
						button.disabled = false
					}
				})
				box.appendChild(button)
			}
			return box
		}

		/** Ask the host half to open the page in a window. */
		async function openInWindow(button) {
			const text = copy()
			const note = document.createElement("div")
			note.className = "dsh-wc-message"
			const settle = (message) => {
				note.textContent = message
				const parent = button.parentElement
				if (note.parentElement === null && parent !== null) parent.appendChild(note)
			}
			try {
				const response = await fetch(OPEN_ROUTE, { method: "POST", headers: { accept: "application/json" } })
				let payload = {}
				try { payload = await response.json() } catch (error) { payload = {} }
				if (payload.ok === true) {
					settle(String(payload.via) === "system-browser" ? text.fallbackHanded : text.fallbackOpened)
				} else {
					settle(text.fallbackFailed + "：" + String(payload.error || payload.via || "HTTP " + response.status))
				}
			} catch (error) {
				settle(text.fallbackFailed + "：" + messageOf(error))
			}
		}

		/**
		 * Ask the host half to open an external link in the system browser (#1).
		 * @param url - the URL reported by the native popup bridge.
		 */
		async function openExternalLink(url) {
			try {
				const parsed = new URL(url)
				if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return
				url = parsed.href
				const response = await fetch(EXTERNAL_ROUTE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ url }),
				})
				const payload = await response.json()
				if (payload.ok !== true) {
					console.warn("[dsh-webchat] external link:", payload.error || "not opened")
				}
			} catch (error) {
				console.warn("[dsh-webchat] external link failed:", error)
			}
		}

		/**
		 * The document-root container that keeps the guest alive.
		 */
		function overlayContainer() {
			const existing = document.querySelector("[" + OVERLAY_ATTR + "]")
			if (existing !== null && existing !== undefined) return existing
			const box = document.createElement("div")
			box.setAttribute(OVERLAY_ATTR, "")
			document.body.appendChild(box)
			return box
		}

		/**
		 * Read everything the guest page itself can reach: its storage and its
		 * own cookie string. That string cannot carry HttpOnly cookies — only the
		 * host half can, and only when it reaches Electron — but it is what keeps
		 * a login alive when it cannot.
		 * @param element - the live webview.
		 * @returns the guest state as JSON text.
		 */
		function readGuestState(element) {
			return element.executeJavaScript(
				"location.origin !== 'https://chat.deepseek.com' ? null : JSON.stringify({ origin: location.origin, storage: Object.keys(localStorage).filter(function (key) { return !/^(aws_waf|awswaf)/i.test(key) }).map(function (key) { return [key, localStorage.getItem(key)] }), cookie: document.cookie.split(';').map(function (pair) { return pair.trim() }).filter(function (pair) { return pair && !/^aws-waf-token=/i.test(pair) }).join('; ') })",
			)
		}

		/**
		 * Write a guest state back into the page, ignoring stale WAF storage.
		 * Explicitly imported cookies are restored as supplied (#3); automatic
		 * snapshots never save WAF clearance cookies.
		 * Cookies are re-scoped to the site root, which is where a login cookie
		 * belongs; the original attributes are not recoverable from
		 * `document.cookie`.
		 * @param element - the live webview.
		 * @param state - `{ storage, cookie }`.
		 */
		function writeGuestState(element, state) {
			return element.executeJavaScript(
				"(function () { if (location.origin !== 'https://chat.deepseek.com') return false; var state = " + JSON.stringify(state) + ";"
				+ " var storage = Array.isArray(state.storage) ? state.storage : [];"
				+ " for (var i = 0; i < storage.length; i++) { if (/^(aws_waf|awswaf)/i.test(storage[i][0])) continue; try { localStorage.setItem(storage[i][0], storage[i][1]) } catch (error) {} }"
				+ " if (typeof state.cookie === 'string' && state.cookie !== '') {"
				+ " var parts = state.cookie.split(';');"
				+ " for (var j = 0; j < parts.length; j++) {"
				+ " var pair = parts[j].trim();"
				+ " if (pair.indexOf('=') === -1) continue;"
				+ " try { document.cookie = pair + '; path=/' } catch (error) {}"
				+ " } }"
				+ " return true })()",
			)
		}

		/**
		 * Ask the host to put the saved session back before the page is
		 * navigated: cookies through the shell's session API where that is
		 * reachable, and the guest's own storage and cookie string either way.
		 * @param partition - the partition the shell issued for the lease.
		 * @returns `{ storage, cookie }` to apply, or null when there is nothing.
		 */
		async function restoreGuestSession(partition) {
			try {
				const response = await fetch(RESTORE_ROUTE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ partition }),
				})
				const payload = await response.json()
				if (payload === null || typeof payload !== "object") return null
				if (payload.ok !== true) {
					console.warn("[dsh-webchat] session cookies:", payload.error || "not restored")
				}
				const storage = Array.isArray(payload.storage) ? payload.storage : []
				const cookie = typeof payload.cookie === "string" ? payload.cookie : ""
				if (storage.length === 0 && cookie === "") return null
				return { storage, cookie }
			} catch (error) {
				console.warn("[dsh-webchat] session restore failed:", error)
				return null
			}
		}

		/** Check the live URL before any session operation; scripts check it again. */
		function onDeepSeek(element) {
			try { return new URL(element.getURL()).origin === "https://chat.deepseek.com" }
			catch (error) { return false }
		}

		/**
		 * Ask the host to refresh the snapshot. `withState` ships what only the
		 * guest can read; the unload beacon deliberately skips it (the host then
		 * keeps the previous values).
		 * @param withState - whether to include the guest's own state.
		 * @param target - the guest record; defaults to the live one, which
		 *   disposal clears before its last save.
		 */
		async function saveGuestSession(withState, target) {
			const record = target === undefined ? guest : target
			if (!record || !record.ready || !onDeepSeek(record.element)) return
			const body = { partition: record.partition }
			if (withState) {
				try {
					const state = JSON.parse(await readGuestState(record.element))
					if (!record.ready || !onDeepSeek(record.element) || !state || state.origin !== "https://chat.deepseek.com") return
					if (!Array.isArray(state.storage) || typeof state.cookie !== "string") return
					body.storage = state.storage
					body.cookie = state.cookie
				} catch (error) { return }
			}
			try {
				await fetch(SAVE_ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
			} catch (error) {
				console.warn("[dsh-webchat] session save failed:", error)
			}
		}

		/**
		 * Reserve a guest and attach its webview, once per app run.
		 * @returns a promise resolving once the attempt settled.
		 */
		function ensureGuest() {
			if (guest !== null || bridge === undefined) return Promise.resolve()
			if (acquiring !== null) return acquiring
			acquiring = (async () => {
				try {
					const reservation = await bridge.acquire(STORAGE_IDENTITY)
					if (reservation === null || typeof reservation !== "object"
						|| typeof reservation.lease !== "string" || typeof reservation.partition !== "string") {
						throw new Error("the desktop browser bridge returned no reservation")
					}
					// Cookies land on the partition before anything is requested; the
					// guest's own storage and cookie string come back with them.
					const restored = await restoreGuestSession(reservation.partition)
					const element = document.createElement("webview")
					element.setAttribute("name", reservation.lease)
					element.setAttribute("partition", reservation.partition)
					element.setAttribute("allowpopups", "")
					element.setAttribute("data-sidebar-browser-frame", "")
					element.setAttribute("src", "about:blank#" + reservation.lease)
					// The site greets a UA containing "electron" with its「使用环境异常」
					// dialog (#3's trade-off, seen live on 0.7.6), and its check is a
					// literal substring test. Drop ONLY the Electron token: the Chrome
					// version and structure stay exactly as the engine reports them, so
					// client hints stay consistent — the full rewrite this replaces once
					// tripped WAF challenges and Google sign-in by rewriting
					// "Chrome/x.y.z.w" into a fabricated "Chrome/x.0.0.0".
					const userAgent = typeof navigator === "object" && typeof navigator.userAgent === "string"
						? navigator.userAgent.replace(/\s*Electron\/[\d.]+/i, "")
						: ""
					if (userAgent !== "") element.setAttribute("useragent", userAgent)
					element.addEventListener("dom-ready", function () {
						if (userAgent !== "") {
							try {
								element.setUserAgent(userAgent)
							} catch (error) {
								console.warn("[dsh-webchat] could not set the guest user agent:", error)
							}
						}
						element.loadURL(PAGE_URL).catch(function (error) {
							failure = messageOf(error)
						})
					}, { once: true })
					// Storage and cookies can only be written while the page is on
					// its own origin, so both are restored after the first load and
					// the page is then asked to load once more — this time already
					// signed in. Until that settles, snapshots are skipped: the
					// freshly loaded page still has empty storage, and saving that
					// would erase the very snapshot being restored.
					let storageState = restored === null ? "none" : "pending"
					const record = { lease: reservation.lease, partition: reservation.partition, element, ready: false }
					element.addEventListener("did-start-loading", function () { record.ready = false })
					element.addEventListener("did-finish-load", async function () {
						if (guest !== record || !onDeepSeek(element) || storageState === "restoring") return
						if (storageState === "pending") {
							storageState = "restoring"
							try {
								const applied = await writeGuestState(element, restored)
								if (guest !== record) return
								if (applied !== true || !onDeepSeek(element)) { storageState = "pending"; return }
								storageState = "reloading"
								element.reload()
							} catch (error) {
								storageState = "pending"
								console.warn("[dsh-webchat] could not restore site storage:", error)
							}
							return
						}
						storageState = "done"
						record.ready = true
						void saveGuestSession(true, record)
					})
					// The shell already reports all permitted popup requests, including
					// window.open, middle-click and same-origin links, for this lease.
					if (typeof bridge.onOpenRequested === "function") {
						record.unsubscribeOpen = bridge.onOpenRequested(reservation.lease, (url) => {
							if (guest === record) void openExternalLink(url)
						})
					}
					const onUnload = function () {
						if (!record.ready || !onDeepSeek(element)) return
						try { navigator.sendBeacon(SAVE_ROUTE, JSON.stringify({ partition: record.partition })) }
						catch (error) { /* The page is going away. */ }
					}
					window.addEventListener("beforeunload", onUnload)
					const container = overlayContainer()
					container.appendChild(element)

					record.container = container
					record.onUnload = onUnload
					record.timer = setInterval(function () { void saveGuestSession(true, record) }, SAVE_INTERVAL_MS)
					guest = record
					failure = ""
				} catch (error) {
					failure = messageOf(error)
				} finally {
					acquiring = null
				}
			})()
			return acquiring
		}

		/** Release the guest, for plugin disposal. */
		function disposeGuest() {
			if (guest === null) return
			const releasing = guest
			guest = null
			if (releasing.timer !== undefined) clearInterval(releasing.timer)
			if (releasing.unsubscribeOpen) releasing.unsubscribeOpen()
			if (releasing.onUnload !== undefined) window.removeEventListener("beforeunload", releasing.onUnload)
			// Last chance to keep the login: the page is about to be torn down.
			void saveGuestSession(true, releasing)
			releasing.container.remove()
			if (bridge !== undefined) {
				try { void bridge.release(releasing.lease) } catch (error) { /* already gone */ }
			}
		}

		/** Position the persistent guest over the area the slot gave this panel. */
		function syncBounds(host) {
			if (guest === null) return
			const rect = host.getBoundingClientRect()
			const style = guest.container.style
			style.left = rect.left + "px"
			style.top = rect.top + "px"
			style.width = rect.width + "px"
			style.height = rect.height + "px"
		}

		function installRefreshShortcuts() {
			if (!shortcuts) return () => {}
			// Registered commands are delivered from focused native webviews too;
			// fixed-input observers only see main-document DOM events in rc.2.
			const bindings = [{ code: "F5", modifiers: [] }, { code: "KeyR", modifiers: ["primary"] }]
			const disposers = bindings.map(function (binding, index) {
				return shortcuts.register({
					id: "webchat.refresh." + index, label: () => copy().refresh, aliases: [],
					defaults: { "desktop:windows": binding, "desktop:macos": binding, "desktop:linux": binding },
					regions: ["page", "editable"], modals: [],
					resolve: function (context) {
						const record = guest
						if (!record || record.container.style.display === "none" || context.modal !== null || context.region === "terminal") return { status: "pass" }
						return { status: "handled", run: function () {
							if (guest !== record || record.container.style.display === "none") return
							try { record.ready = false; record.element.reload() }
							catch (error) { console.warn("[dsh-webchat] reload failed:", error) }
						} }
					},
				})
			})
			return () => disposers.forEach((dispose) => dispose())
		}

		/** The center-column panel the layout mounts while this id is selected. */
		function WebchatPanel() {
			const hostRef = React.useRef(null)

			React.useEffect(function () {
				const host = hostRef.current
				if (host === null || host === undefined) return undefined
				let alive = true
				let observer
				let reposition = null
				let disposeRefresh = () => {}

				const showFallback = function (text) {
					host.replaceChildren()
					host.appendChild(messageBox(text, {
						label: copy().fallbackAction,
						run: (button) => openInWindow(button),
					}))
				}

				if (bridge === undefined) {
					showFallback(copy().fallbackNote)
					return undefined
				}

				void ensureGuest().then(function () {
					if (!alive) return
					if (guest === null) {
						showFallback(copy().failed + "：" + (failure || "unknown"))
						return
					}
					host.replaceChildren()
					syncBounds(host)
					guest.container.style.display = "block"
					disposeRefresh = installRefreshShortcuts()
					reposition = function () {
						if (alive) syncBounds(host)
					}
					if (typeof ResizeObserver === "function") {
						observer = new ResizeObserver(reposition)
						observer.observe(host)
					}
					window.addEventListener("resize", reposition)
				})

				return function () {
					alive = false
					disposeRefresh()
					if (observer !== undefined) observer.disconnect()
					if (reposition !== null) window.removeEventListener("resize", reposition)
					// Hidden, never detached: the guest keeps its page and its login.
					if (guest !== null) guest.container.style.display = "none"
				}
			}, [])

			return h("div", { ref: hostRef, className: "dsh-wc-host" })
		}

		/** The sidebar row's icon. The sidebar owns the button around it. */
		function WebchatIcon(props) {
			const size = props !== null && props !== undefined && typeof props.size === "number" ? props.size : 16
			return h("svg", {
				viewBox: "0 0 16 16",
				width: size,
				height: size,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.3,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
			},
				h("path", { d: "M8 2.5a5.5 5.5 0 0 0-4.7 8.3L2.5 13.5l2.8-.8A5.5 5.5 0 1 0 8 2.5z" }),
				h("circle", { cx: 8, cy: 8, r: 1.1, fill: "currentColor", stroke: "none" }),
			)
		}

		/** Register the nav row and the page, then own the guest's lifetime. */
		function apply(ctx) {
			shortcuts = ctx.shortcuts
			ensureStyle()
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: -1,
				label: () => copy().label,
			}, WebchatIcon))
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
			}, WebchatPanel))
			ctx.effect(() => () => {
				disposeGuest()
			}, "dsh-webchat: native guest")
		}

		return { inject: ["slots", "shortcuts"], apply }
	},
})
