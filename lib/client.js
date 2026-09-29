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
		/** How often the guest's own storage is snapshotted while it is open. */
		const SAVE_INTERVAL_MS = 30000

		const STYLE_ID = "dsh-webchat-style"
		const OVERLAY_ATTR = "data-dsh-webchat-overlay"

		/** Locale at read time, so the label thunk follows the app's language. */
		function isChinese() {
			const tag = document.documentElement.getAttribute("lang")
				|| (typeof navigator === "object" ? navigator.language : "")
				|| ""
			return String(tag).toLowerCase().indexOf("zh") === 0
		}

		/** Every visible string this plugin owns. */
		function copy() {
			return isChinese()
				? {
					label: "DeepSeek 网页",
					failed: "载入失败",
					fallbackNote: "这个 Harness 没有提供原生浏览器访客（桌面端才有），无法在窗口内显示官方页面。",
					fallbackAction: "在窗口中打开",
					fallbackOpened: "已打开 DeepSeek 网页",
					fallbackHanded: "已交给系统默认浏览器打开",
					fallbackFailed: "打开失败",
				}
				: {
					label: "DeepSeek Web",
					failed: "Could not load it",
					fallbackNote: "This Harness provides no native browser guest (only the desktop app does), so the official page cannot render in the window.",
					fallbackAction: "Open it in a window",
					fallbackOpened: "DeepSeek Web is open",
					fallbackHanded: "Handed to the system default browser",
					fallbackFailed: "Could not open",
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
		/** In-flight acquisition, so two mounts cannot reserve two guests. */
		let acquiring = null
		/** Last acquisition failure, if any. */
		let failure = ""

		/** Render any thrown value as a message. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error)
		}

		/** Inject the stylesheet once. */
		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return
			const tag = document.createElement("style")
			tag.id = STYLE_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
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
		 * A plain Chrome user agent for the guest, derived from this renderer's
		 * own so the Chrome major version stays truthful.
		 *
		 * chat.deepseek.com greets an `electron` token in the user agent with a
		 * "使用环境异常 / Abnormal usage environment" dialog, and dismissing it is
		 * stored per guest partition — process-lifetime here, so it would come
		 * back on every restart. Its check is literally
		 * `navigator.userAgent.toLowerCase().includes("electron")`, so not
		 * advertising Electron is what keeps the page clean.
		 * @returns a Chrome user agent, or '' when this renderer reports none.
		 */
		function cleanUserAgent() {
			const ua = typeof navigator === "object" && typeof navigator.userAgent === "string" ? navigator.userAgent : ""
			const platform = (ua.match(/^Mozilla\/5\.0 \([^)]*\)/) || [])[0]
			const chrome = (ua.match(/Chrome\/([0-9]+)/) || [])[1]
			if (platform === undefined || chrome === undefined) return ""
			return platform + " AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chrome + ".0.0.0 Safari/537.36"
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

		/** Read the guest page's own storage as `[[key, value], …]`. */
		function readStorage(element) {
			return element.executeJavaScript(
				"JSON.stringify(Object.keys(localStorage).map(function (key) { return [key, localStorage.getItem(key)] }))",
			)
		}

		/** Write `[[key, value], …]` back into the guest page's storage. */
		function writeStorage(element, entries) {
			return element.executeJavaScript(
				"(function () { var entries = " + JSON.stringify(entries) + ";"
				+ " for (var i = 0; i < entries.length; i++) { try { localStorage.setItem(entries[i][0], entries[i][1]) } catch (error) {} }"
				+ " return entries.length })()",
			)
		}

		/**
		 * Ask the host to copy the saved cookies onto this run's partition. This
		 * runs before the first navigation, so the page's first request already
		 * carries them.
		 * @param partition - the partition the shell issued for the lease.
		 * @returns the saved site storage, or null when there is none usable.
		 */
		async function restoreGuestSession(partition) {
			try {
				const response = await fetch(RESTORE_ROUTE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ partition }),
				})
				const payload = await response.json()
				if (payload === null || typeof payload !== "object" || payload.ok !== true) {
					console.warn("[dsh-webchat] session restore:", payload === null ? "no answer" : payload.error || "failed")
					return null
				}
				return Array.isArray(payload.storage) && payload.storage.length > 0 ? payload.storage : null
			} catch (error) {
				console.warn("[dsh-webchat] session restore failed:", error)
				return null
			}
		}

		/**
		 * Ask the host to refresh the snapshot. Cookies are read host-side;
		 * `withStorage` additionally ships the page's storage, which the unload
		 * beacon deliberately skips (the host then keeps the previous one).
		 * @param withStorage - whether to include the guest's storage.
		 * @param target - the guest record; defaults to the live one, which
		 *   disposal clears before its last save.
		 */
		async function saveGuestSession(withStorage, target) {
			const record = target === undefined ? guest : target
			if (record === null || record === undefined) return
			const body = { partition: record.partition }
			if (withStorage) {
				try {
					const parsed = JSON.parse(await readStorage(record.element))
					if (Array.isArray(parsed)) body.storage = parsed
				} catch (error) {
					// Not ready, or nothing stored: cookies still get saved.
				}
			}
			try {
				await fetch(SAVE_ROUTE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				})
			} catch (error) {
				// Best effort: a snapshot that fails costs a login, not the page.
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
					// Cookies land on the partition before anything is requested.
					const storage = await restoreGuestSession(reservation.partition)
					const element = document.createElement("webview")
					element.setAttribute("name", reservation.lease)
					element.setAttribute("partition", reservation.partition)
					element.setAttribute("allowpopups", "")
					element.setAttribute("src", "about:blank#" + reservation.lease)
					const userAgent = cleanUserAgent()
					if (userAgent !== "") element.setAttribute("useragent", userAgent)
					element.addEventListener("dom-ready", function () {
						// The guest exists by now and nothing has been navigated yet,
						// so this is the user agent the page actually loads with.
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
					// Site storage can only be written while the page is on its own
					// origin, so it is restored after the first load and then the
					// page is asked to load once more — this time already signed in.
					// Until that settles, snapshots are skipped: the freshly loaded
					// page still has empty storage, and saving that would erase the
					// very snapshot being restored.
					let storageState = storage === null ? "none" : "pending"
					element.addEventListener("did-finish-load", function () {
						if (storageState !== "pending") return
						storageState = "restoring"
						Promise.resolve(writeStorage(element, storage))
							.then(function () {
								storageState = "done"
								element.reload()
							})
							.catch(function (error) {
								storageState = "done"
								console.warn("[dsh-webchat] could not restore site storage:", error)
							})
					})
					element.addEventListener("did-finish-load", function () {
						if (storageState === "pending" || storageState === "restoring") return
						void saveGuestSession(true)
					})
					const onUnload = function () {
						// Cookies are the part that matters and the host reads them
						// itself, so the beacon carries no payload.
						try {
							navigator.sendBeacon(SAVE_ROUTE, JSON.stringify({ partition: reservation.partition }))
						} catch (error) {
							// The page is going away; nothing left to do.
						}
					}
					window.addEventListener("beforeunload", onUnload)
					const container = overlayContainer()
					container.appendChild(element)
					guest = {
						lease: reservation.lease,
						partition: reservation.partition,
						element,
						container,
						onUnload,
						timer: setInterval(function () { void saveGuestSession(true) }, SAVE_INTERVAL_MS),
					}
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

		/** The center-column panel the layout mounts while this id is selected. */
		function WebchatPanel() {
			const hostRef = React.useRef(null)

			React.useEffect(function () {
				const host = hostRef.current
				if (host === null || host === undefined) return undefined
				let alive = true
				let observer
				let reposition = null

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

		return { inject: ["slots"], apply }
	},
})
