/**
 * dsh-webchat — browser half.
 *
 * One sidebar entry that opens the official chat.deepseek.com web app **inside
 * the DSH window**, in the center column, exactly like the other full-page
 * views (Automation Tasks and friends).
 *
 * It can do that because the desktop shell lends out native browser guests: the
 * renderer asks `globalThis.dshDesktop.browser` for a reservation and then
 * attaches a `<webview>` whose `src` is `about:blank#<lease>` and whose
 * `partition` matches — the shell approves exactly that element and assigns the
 * real web preferences, so the page is not subject to `frame-ancestors` the way
 * an iframe would be. This is the same mechanism the built-in side-card browser
 * uses; see MAINTAINING.md.
 *
 * Where that bridge is absent (a plain `dsh web` profile, not the desktop app)
 * the entry falls back to asking the host half to open the page in a window.
 *
 * Everything here is plain DOM — no React, no build step.
 */
window.__ModuleLoader__.load({
	id: "@jaychang1989/dsh-webchat",
	factory: () => {
		var module = { exports: {} }
		var exports = module.exports

		/** Host route used only by the window fallback. */
		var OPEN_ROUTE = '/api/dsh-webchat/open'
		/** The page the panel shows. */
		var PAGE_URL = 'https://chat.deepseek.com/'
		/**
		 * Storage identity for the guest partition. The shell keys one
		 * process-lifetime partition per identity, so this string is what makes
		 * the DeepSeek login survive panel close/reopen within one run.
		 */
		var STORAGE_IDENTITY = 'dsh-webchat'

		var ENTRY_ATTR = 'data-dsh-webchat-entry'
		var VIEW_ATTR = 'data-dsh-webchat-view'
		var ACTIVE_ATTR = 'data-dsh-webchat-active'
		var OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']
		var ACTIVATE_EVENT = 'dsh-panel-activate'
		var PANEL_NAME = 'webchat'
		var STYLE_ID = 'dsh-webchat-style'
		var TOAST_ATTR = 'data-dsh-webchat-toast'
		var FRAME_CLASS = 'dsh-wc-frame'

		var ZH = typeof navigator === 'object' && typeof navigator.language === 'string'
			&& navigator.language.toLowerCase().indexOf('zh') === 0

		/** Surface copy; the plugin ships both languages rather than a locale service. */
		var T = ZH
			? {
				label: 'DeepSeek 网页',
				tooltip: '在 Harness 内打开 chat.deepseek.com',
				failed: '载入失败',
				fallbackOpened: '已打开 DeepSeek 网页',
				fallbackHanded: '已交给系统默认浏览器打开',
				fallbackFailed: '打开失败',
			}
			: {
				label: 'DeepSeek Web',
				tooltip: 'Open chat.deepseek.com inside Harness',
				failed: 'Could not load it',
				fallbackOpened: 'DeepSeek Web is open',
				fallbackHanded: 'Handed to the system default browser',
				fallbackFailed: 'Could not open',
			}

		/** Entry, center-column takeover and guest styling. */
		var CSS = [
			"[data-pane='conversation'],[class*='centerCol']{position:relative}",
			'[' + VIEW_ATTR + ']{position:absolute;inset:0;display:none;z-index:60;background:var(--dsw-alias-bg-base)}',
			'html[' + ACTIVE_ATTR + ']:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [' + VIEW_ATTR + ']{display:flex}',
			"html[" + ACTIVE_ATTR + "]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane='conversation'] > :not([" + VIEW_ATTR + ']),',
			'html[' + ACTIVE_ATTR + "]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*='centerCol'] > :not([" + VIEW_ATTR + ']){display:none !important}',
			'.' + FRAME_CLASS + '{-webkit-app-region:no-drag;border:0;flex:auto;width:100%;min-width:0;height:100%;min-height:0;display:flex}',
			'.dsh-wc-message{margin:auto;max-width:460px;padding:22px;text-align:center;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family)}',
			'[' + ENTRY_ATTR + ']{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 12px;background:transparent;border:none;border-radius:8px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;white-space:nowrap}',
			'[' + ENTRY_ATTR + ']:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
			'[' + ENTRY_ATTR + '][data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
			'[' + ENTRY_ATTR + '][disabled]{opacity:.55;cursor:progress}',
			'[' + ENTRY_ATTR + '] [data-part=icon]{display:inline-flex;align-items:center;justify-content:center;flex:none}',
			'[' + ENTRY_ATTR + '] [data-part=label]{overflow:hidden;text-overflow:ellipsis}',
			'[data-dsh-frame][data-sidebar-collapsed] [' + ENTRY_ATTR + ']{justify-content:center;padding:0}',
			'[data-dsh-frame][data-sidebar-collapsed] [' + ENTRY_ATTR + '] [data-part=label]{display:none}',
			'[' + TOAST_ATTR + ']{position:fixed;right:20px;bottom:20px;z-index:200;max-width:420px;padding:10px 14px;border-radius:10px;background:var(--dsw-alias-bg-elevated);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:13px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
			'[' + TOAST_ATTR + '][data-state=bad]{border-color:var(--dsw-alias-state-danger,#ef4444);color:var(--dsw-alias-state-danger,#ef4444)}',
		].join('\n')

		/**
		 * The desktop shell's browser bridge, when this renderer is the desktop
		 * app's primary frame. A plain web profile exposes only a protocol
		 * version, so the window fallback takes over.
		 */
		const carrier = globalThis.dshDesktop
		const guests = carrier !== null && typeof carrier === 'object' && carrier.protocolVersion === 1
			? carrier.browser
			: undefined

		/** Inject the stylesheet once. */
		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return
			var tag = document.createElement('style')
			tag.id = STYLE_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		/**
		 * A plain Chrome user agent for the guest, derived from this renderer's
		 * own so the Chrome major version stays truthful.
		 *
		 * chat.deepseek.com greets an `electron` token in the user agent with a
		 * "使用环境异常 / Abnormal usage environment" dialog, and its dismissal is
		 * stored per guest partition — which is process-lifetime here, so it
		 * would come back on every restart. Its check is literally
		 * `navigator.userAgent.toLowerCase().includes("electron")` (the other
		 * arm, `window.process.type`, cannot fire in a sandboxed, isolated
		 * guest), so not advertising Electron is what keeps the page clean.
		 * @returns a Chrome user agent, or '' when this renderer reports none.
		 */
		function cleanUserAgent() {
			var ua = typeof navigator === 'object' && typeof navigator.userAgent === 'string' ? navigator.userAgent : ''
			var platform = (ua.match(/^Mozilla\/5\.0 \([^)]*\)/) || [])[0]
			var chrome = (ua.match(/Chrome\/([0-9]+)/) || [])[1]
			if (platform === undefined || chrome === undefined) return ''
			return platform + ' AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chrome + '.0.0.0 Safari/537.36'
		}

		/** Show one transient message in the corner. */
		function toast(text, state) {
			var previous = document.querySelector('[' + TOAST_ATTR + ']')
			if (previous !== null) previous.remove()
			var box = document.createElement('div')
			box.setAttribute(TOAST_ATTR, '')
			if (state !== undefined) box.setAttribute('data-state', state)
			box.textContent = text
			document.body.appendChild(box)
			setTimeout(function () {
				if (box.isConnected) box.remove()
			}, state === 'bad' ? 8000 : 3000)
		}

		/** Ask the host half to open the page in a window (the non-desktop path). */
		async function openInWindow() {
			const response = await fetch(OPEN_ROUTE, { method: 'POST', headers: { accept: 'application/json' } })
			let payload = {}
			try { payload = await response.json() } catch (error) { payload = {} }
			if (!response.ok && payload.error === undefined) payload.error = 'HTTP ' + response.status
			return payload
		}

		/** Tiny observable for the panel's open state. */
		function createController() {
			var open = false
			var listeners = new Set()
			var notify = function () {
				listeners.forEach(function (listener) {
					try {
						listener()
					} catch (error) {
						console.warn('[dsh-webchat] listener failed:', error)
					}
				})
			}
			return {
				isOpen: function () { return open },
				subscribe: function (listener) {
					listeners.add(listener)
					return function () { listeners.delete(listener) }
				},
				toggle: function () { open = !open; notify() },
				close: function () { if (!open) return; open = false; notify() },
			}
		}

		/** The sidebar shell root, or undefined while it is not mounted. */
		function sidebarRoot() {
			var column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
			if (column === null) return undefined
			var logoRow = column.querySelector('[class*="logoRow"]')
			var owner = logoRow === null ? null : logoRow.parentElement
			return owner !== null && owner !== undefined ? owner : (column.firstElementChild || undefined)
		}

		/** The New Session button the entry is ordered against. */
		function newSessionButton(root) {
			var nested = root.querySelector('button[class*="newSession"]')
			if (nested !== null) return nested
			for (var i = 0; i < root.children.length; i++) {
				if (root.children[i].tagName === 'BUTTON') return root.children[i]
			}
			return undefined
		}

		/** Build the entry row. */
		function createEntry(onClick) {
			var entry = document.createElement('button')
			entry.type = 'button'
			entry.setAttribute(ENTRY_ATTR, '')
			entry.setAttribute('data-dsh-plugin', 'webchat')
			entry.setAttribute('data-dsh-part', 'sidebar-entry')
			entry.setAttribute('aria-label', T.label)
			entry.setAttribute('title', T.tooltip)
			var icon = document.createElement('span')
			icon.setAttribute('data-part', 'icon')
			icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 0 0-4.7 8.3L2.5 13.5l2.8-.8A5.5 5.5 0 1 0 8 2.5z"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/></svg>'
			var label = document.createElement('span')
			label.setAttribute('data-part', 'label')
			label.textContent = T.label
			entry.appendChild(icon)
			entry.appendChild(label)
			entry.addEventListener('click', onClick)
			return entry
		}

		/** Re-insert the entry after the New Session row when React displaces it. */
		function placeEntry(root, entry) {
			var button = newSessionButton(root)
			if (button === undefined) return false
			if (entry.parentElement === root) return true
			var row = button.closest('[class*="logoRow"]')
			var base = row !== null && row.parentElement === root ? row : button
			var family = Array.prototype.filter.call(root.children, function (el) {
				return el.matches && el.matches('[' + ENTRY_ATTR + '], [data-dsh-taskboard-entry], [data-dsh-ssh-entry]')
			})
			var anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
			root.insertBefore(entry, anchor)
			return true
		}

		/** Mount the sidebar entry with its self-healing observers. */
		function mountSidebarEntry(controller, entry) {
			var root
			var placed = false

			var tryPlace = function () {
				if (root !== undefined && !root.isConnected) {
					rootObserver.disconnect()
					root = undefined
					placed = false
				}
				if (placed) {
					if (document.body.contains(entry)) return
					rootObserver.disconnect()
					root = undefined
					placed = false
				}
				if (root === undefined) root = sidebarRoot()
				if (root === undefined) return
				placed = placeEntry(root, entry)
				if (placed) rootObserver.observe(root, { childList: true, subtree: true })
			}

			var waitObserver = new MutationObserver(function () { tryPlace() })
			waitObserver.observe(document.body, { childList: true, subtree: true })
			var rootObserver = new MutationObserver(function () {
				if (root === undefined || !root.isConnected) {
					placed = false
					tryPlace()
					return
				}
				if (!root.contains(entry)) placed = placeEntry(root, entry)
			})

			var syncActive = function () {
				if (controller.isOpen()) entry.dataset.active = 'true'
				else delete entry.dataset.active
			}
			var unsubscribe = controller.subscribe(syncActive)
			syncActive()
			tryPlace()

			return function () {
				waitObserver.disconnect()
				rootObserver.disconnect()
				unsubscribe()
				entry.remove()
			}
		}

		/** The center column that hosts full-page views. */
		function conversationColumn() {
			return document.querySelector('[data-pane="conversation"], [class*="centerCol"]') || undefined
		}

		/**
		 * Mount the panel that carries the guest.
		 *
		 * The guest is created lazily on first open and then kept mounted while
		 * the panel is closed, so re-opening does not reload the page and the
		 * DeepSeek session stays where it was.
		 * @param controller - panel open state.
		 * @returns disposer removing the panel and releasing the guest.
		 */
		function mountPanel(controller) {
			var container
			var frame
			var lease
			var failed = false

			var showMessage = function (text) {
				var box = document.createElement('div')
				box.className = 'dsh-wc-message'
				box.textContent = text
				container.appendChild(box)
			}

			/** Reserve a guest and attach its webview. */
			var ensureGuest = async function () {
				if (frame !== undefined || failed) return
				try {
					const reservation = await guests.acquire(STORAGE_IDENTITY)
					if (reservation === null || typeof reservation !== 'object'
						|| typeof reservation.lease !== 'string' || typeof reservation.partition !== 'string') {
						throw new Error('the desktop browser bridge returned no reservation')
					}
					lease = reservation.lease
					const element = document.createElement('webview')
					element.className = FRAME_CLASS
					element.setAttribute('name', reservation.lease)
					element.setAttribute('partition', reservation.partition)
					element.setAttribute('allowpopups', '')
					element.setAttribute('src', 'about:blank#' + reservation.lease)
					const userAgent = cleanUserAgent()
					if (userAgent !== '') element.setAttribute('useragent', userAgent)
					element.addEventListener('dom-ready', function () {
						// The guest exists by now, and nothing has been navigated
						// yet, so this UA is the one the page actually loads with.
						if (userAgent !== '') {
							try {
								element.setUserAgent(userAgent)
							} catch (error) {
								console.warn('[dsh-webchat] could not set the guest user agent:', error)
							}
						}
						element.loadURL(PAGE_URL).catch(function (error) {
							toast(T.failed + '：' + (error instanceof Error ? error.message : String(error)), 'bad')
						})
					}, { once: true })
					frame = element
					container.appendChild(element)
				} catch (error) {
					failed = true
					showMessage(T.failed + '：' + (error instanceof Error ? error.message : String(error)))
				}
			}

			var ensure = function () {
				if (container !== undefined) {
					if (container.isConnected) return
					container.remove()
					container = undefined
					frame = undefined
				}
				var column = conversationColumn()
				if (column === undefined) return
				container = document.createElement('div')
				container.setAttribute(VIEW_ATTR, '')
				container.setAttribute('data-dsh-plugin', 'webchat')
				column.appendChild(container)
			}

			var waitObserver = new MutationObserver(function () { ensure() })

			var applyActive = function () {
				if (controller.isOpen()) {
					OTHER_ACTIVE_ATTRS.forEach(function (attr) { document.documentElement.removeAttribute(attr) })
					document.documentElement.setAttribute(ACTIVE_ATTR, '')
					// Mount before announcing: the arbitration event dispatches into
					// other plugins, and a throwing listener must not be able to leave
					// this panel half-open.
					ensure()
					void ensureGuest()
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
				} else {
					document.documentElement.removeAttribute(ACTIVE_ATTR)
				}
			}
			var onOtherActivate = function (event) {
				var detail = event.detail
				if ((detail === 'taskboard' || detail === 'ssh') && controller.isOpen()) controller.close()
			}
			/**
			 * The shell's own panel list owns the center column. Its rows —
			 * Plugins, Automation Tasks, the task board, sessions, workspaces —
			 * do not take part in the third-party `data-*-active` handshake, so
			 * this panel has to yield on any navigation from the sidebar, or its
			 * overlay would keep hiding the page the shell just selected.
			 */
			var SIDEBAR_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'
			var onClickSidebarRow = function (event) {
				if (!controller.isOpen()) return
				var target = event.target
				if (target === null || target.closest === undefined) return
				// This plugin's own row toggles the panel; it is not navigation.
				if (target.closest('[' + ENTRY_ATTR + ']') !== null) return
				if (target.closest(SIDEBAR_SELECTOR) !== null) controller.close()
			}

			document.addEventListener('click', onClickSidebarRow, true)
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
			var unsubscribe = controller.subscribe(applyActive)
			applyActive()
			ensure()
			waitObserver.observe(document.body, { childList: true, subtree: true })

			return function () {
				document.removeEventListener('click', onClickSidebarRow, true)
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
				waitObserver.disconnect()
				unsubscribe()
				document.documentElement.removeAttribute(ACTIVE_ATTR)
				if (frame !== undefined) frame.remove()
				if (container !== undefined) container.remove()
				frame = undefined
				container = undefined
				if (lease !== undefined) {
					const releasing = lease
					lease = undefined
					try { void guests.release(releasing) } catch (error) { /* already gone */ }
				}
			}
		}

		/** Mount the entry, plus the panel when the desktop bridge is present. */
		function apply(ctx) {
			ensureStyle()
			var controller = createController()
			var disposers = []

			if (guests !== undefined) {
				// Desktop: the entry toggles the in-app panel.
				var entry = createEntry(function () { controller.toggle() })
				disposers.push(mountSidebarEntry(controller, entry))
				disposers.push(mountPanel(controller))
			} else {
				// Web: no native guest to lend, so the entry asks the host for a window.
				var fallbackEntry = createEntry(async function () {
					if (fallbackEntry.disabled) return
					fallbackEntry.disabled = true
					try {
						var outcome = await openInWindow()
						if (outcome.ok === true) {
							toast(String(outcome.via) === 'system-browser' ? T.fallbackHanded : T.fallbackOpened)
						} else {
							toast(T.fallbackFailed + '：' + String(outcome.error || outcome.via || ''), 'bad')
						}
					} catch (error) {
						toast(T.fallbackFailed + '：' + (error instanceof Error ? error.message : String(error)), 'bad')
					}
					fallbackEntry.disabled = false
				})
				disposers.push(mountSidebarEntry(controller, fallbackEntry))
			}

			ctx.effect(function () {
				return function () {
					disposers.splice(0).forEach(function (dispose) { dispose() })
				}
			}, 'dsh-webchat: ui mounts')
		}

		exports.apply = apply
		exports.inject = []
		return module.exports
	},
})
