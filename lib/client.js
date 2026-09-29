/**
 * dsh-webchat — browser half.
 *
 * One sidebar entry and one panel holding one button. The panel does not chat:
 * chat.deepseek.com cannot be framed (`frame-ancestors 'none'`) and this build
 * has `webviewTag: false`, so the official page opens in a window instead (see
 * lib/index.js). Everything here is plain DOM — no React, no build step.
 *
 * The shell exposes no slot an external plugin can register into, so the entry
 * row and the center-column view are injected at the DOM level and self-heal
 * against React re-renders, exactly as the previous release did.
 */
window.__ModuleLoader__.load({
	id: "@jaychang1989/dsh-webchat",
	factory: () => {
		var module = { exports: {} }
		var exports = module.exports

		/** Routes served by lib/index.js. */
		var API = { state: '/api/dsh-webchat/state', open: '/api/dsh-webchat/open' }
		/** The page the launcher opens (mirrors PAGE_URL on the host half). */
		var PAGE_URL = 'https://chat.deepseek.com/'
		var ENTRY_ATTR = 'data-dsh-webchat-entry'
		var VIEW_ATTR = 'data-dsh-webchat-view'
		var ACTIVE_ATTR = 'data-dsh-webchat-active'
		var OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']
		var ACTIVATE_EVENT = 'dsh-panel-activate'
		var PANEL_NAME = 'webchat'
		var STYLE_ID = 'dsh-webchat-style'

		var ZH = typeof navigator === 'object' && typeof navigator.language === 'string'
			&& navigator.language.toLowerCase().indexOf('zh') === 0

		/** Surface copy; the plugin ships both languages rather than a locale service. */
		var T = ZH
			? {
				label: 'DeepSeek 网页',
				tooltip: '在窗口里打开 chat.deepseek.com',
				title: 'DeepSeek 网页',
				lede: '官方网页版就是完整的客户端：模型选择、深度思考、智能搜索、历史记录、附件上传都在里面。这里只负责把它打开。',
				open: '打开 chat.deepseek.com',
				reopen: '回到已打开的窗口',
				hint: '首次使用请在打开的这个窗口里登录 DeepSeek，之后登录态会保留。',
				checking: '检查中…',
				closed: '窗口未打开',
				opened: '窗口已打开',
				busy: '正在打开…',
				done: '已打开',
				failed: '打开失败',
			}
			: {
				label: 'DeepSeek Web',
				tooltip: 'Open chat.deepseek.com in a window',
				title: 'DeepSeek Web',
				lede: 'The official web app is the whole client: model picker, deep think, smart search, history and attachments all live there. This plugin only opens it.',
				open: 'Open chat.deepseek.com',
				reopen: 'Focus the open window',
				hint: 'Sign in once inside the window it opens; the session is kept afterwards.',
				checking: 'Checking…',
				closed: 'Window is closed',
				opened: 'Window is open',
				busy: 'Opening…',
				done: 'Opened',
				failed: 'Could not open',
			}

		/** Panel and entry styling, scoped to this plugin's own attributes. */
		var CSS = [
			"[data-pane='conversation'],[class*='centerCol']{position:relative}",
			'[' + VIEW_ATTR + ']{position:absolute;inset:0;display:none;z-index:60;background:var(--dsw-alias-bg-base)}',
			'html[' + ACTIVE_ATTR + ']:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [' + VIEW_ATTR + ']{display:block}',
			"html[" + ACTIVE_ATTR + "]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane='conversation'] > :not([" + VIEW_ATTR + ']),',
			'html[' + ACTIVE_ATTR + "]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*='centerCol'] > :not([" + VIEW_ATTR + ']){display:none !important}',
			'[' + ENTRY_ATTR + ']{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 12px;background:transparent;border:none;border-radius:8px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;white-space:nowrap}',
			'[' + ENTRY_ATTR + ']:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
			'[' + ENTRY_ATTR + '][data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
			'[' + ENTRY_ATTR + '] [data-part=icon]{display:inline-flex;align-items:center;justify-content:center;flex:none}',
			'[' + ENTRY_ATTR + '] [data-part=label]{overflow:hidden;text-overflow:ellipsis}',
			'[data-dsh-frame][data-sidebar-collapsed] [' + ENTRY_ATTR + ']{justify-content:center;padding:0}',
			'[data-dsh-frame][data-sidebar-collapsed] [' + ENTRY_ATTR + '] [data-part=label]{display:none}',
			'.dsh-wc-panel{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;padding:18px 20px;gap:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);overflow:auto}',
			'.dsh-wc-head{display:flex;align-items:center;gap:10px;flex:none}',
			'.dsh-wc-title{margin:0;font-size:16px;font-weight:700;letter-spacing:-.01em}',
			'.dsh-wc-chip{margin-left:auto;display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
			'.dsh-wc-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
			".dsh-wc-dot[data-state=ok]{background:var(--dsw-alias-state-success,#22c55e)}",
			".dsh-wc-dot[data-state=bad]{background:var(--dsw-alias-state-danger,#ef4444)}",
			".dsh-wc-dot[data-state=busy]{background:var(--dsw-alias-state-info,#3b82f6)}",
			'.dsh-wc-card{margin:auto;max-width:520px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:26px 22px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer1,var(--dsw-alias-bg-elevated))}',
			'.dsh-wc-lede{margin:0;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary)}',
			'.dsh-wc-url{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}',
			'.dsh-wc-button{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;font-size:13.5px;font-weight:600;border:1px solid transparent;border-radius:9px;background:var(--dsw-alias-state-business-primary,#4f6bfa);color:#fff;cursor:pointer}',
			'.dsh-wc-button:hover:not(:disabled){filter:brightness(1.08)}',
			'.dsh-wc-button:disabled{opacity:.5;cursor:not-allowed}',
			'.dsh-wc-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
			'.dsh-wc-result{margin:0;min-height:18px;font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
			".dsh-wc-result[data-state=bad]{color:var(--dsw-alias-state-danger,#ef4444)}",
		].join('\n')

		/** Inject the stylesheet once. */
		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return
			var tag = document.createElement('style')
			tag.id = STYLE_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
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
		function createEntry(controller) {
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
			entry.addEventListener('click', function () { controller.toggle() })
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
		function mountSidebarEntry(controller) {
			if (document.querySelector('[' + ENTRY_ATTR + ']') !== null) return function () {}
			var entry = createEntry(controller)
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

		/** The center column that hosts takeover panels. */
		function conversationColumn() {
			return document.querySelector('[data-pane="conversation"], [class*="centerCol"]') || undefined
		}

		/** Call one host route. */
		async function call(path, method) {
			const response = await fetch(path, { method: method || 'GET', headers: { accept: 'application/json' } })
			let payload = {}
			try { payload = await response.json() } catch (error) { payload = {} }
			if (!response.ok && payload.error === undefined) payload.error = 'HTTP ' + response.status
			return payload
		}

		/** Build the panel body once; returns the parts the caller updates. */
		function buildPanel(container) {
			var panel = document.createElement('div')
			panel.className = 'dsh-wc-panel'

			var head = document.createElement('div')
			head.className = 'dsh-wc-head'
			var title = document.createElement('h2')
			title.className = 'dsh-wc-title'
			title.textContent = T.title
			var chip = document.createElement('span')
			chip.className = 'dsh-wc-chip'
			var dot = document.createElement('span')
			dot.className = 'dsh-wc-dot'
			var chipText = document.createElement('span')
			chipText.textContent = T.checking
			chip.appendChild(dot)
			chip.appendChild(chipText)
			head.appendChild(title)
			head.appendChild(chip)

			var card = document.createElement('div')
			card.className = 'dsh-wc-card'
			var lede = document.createElement('p')
			lede.className = 'dsh-wc-lede'
			lede.textContent = T.lede
			var url = document.createElement('p')
			url.className = 'dsh-wc-url'
			url.textContent = PAGE_URL
			var button = document.createElement('button')
			button.type = 'button'
			button.className = 'dsh-wc-button'
			button.textContent = T.open
			var hint = document.createElement('p')
			hint.className = 'dsh-wc-hint'
			hint.textContent = T.hint
			var result = document.createElement('p')
			result.className = 'dsh-wc-result'
			card.appendChild(lede)
			card.appendChild(url)
			card.appendChild(button)
			card.appendChild(hint)
			card.appendChild(result)

			panel.appendChild(head)
			panel.appendChild(card)
			container.appendChild(panel)

			var mark = function (state, text) {
				dot.setAttribute('data-state', state)
				chipText.textContent = text
			}
			var idle = function () {
				button.disabled = false
				button.textContent = T.open
			}

			var refresh = async function () {
				try {
					var state = await call(API.state)
					mark(state.appWindowOpen ? 'ok' : '', state.appWindowOpen ? T.opened : T.closed)
					button.textContent = state.appWindowOpen ? T.reopen : T.open
				} catch (error) {
					mark('bad', T.closed)
				}
			}

			button.addEventListener('click', async function () {
				button.disabled = true
				button.textContent = T.busy
				mark('busy', T.busy)
				result.removeAttribute('data-state')
				result.textContent = ''
				try {
					var outcome = await call(API.open, 'POST')
					if (outcome.ok) {
						var via = String(outcome.via || '')
						mark('ok', T.done)
						result.textContent = via === 'system-browser'
							? (ZH ? '已交给系统默认浏览器打开。' : 'Handed to the system default browser.')
							: (ZH ? '已打开应用窗口：' + via : 'Opened an app window: ' + via)
					} else {
						mark('bad', T.failed)
						result.setAttribute('data-state', 'bad')
						result.textContent = String(outcome.error || outcome.via || T.failed)
					}
				} catch (error) {
					mark('bad', T.failed)
					result.setAttribute('data-state', 'bad')
					result.textContent = error instanceof Error ? error.message : String(error)
				}
				idle()
				await refresh()
			})

			return { refresh: refresh }
		}

		/** Mount the panel view into the center column and bind its visibility. */
		function mountPanel(controller) {
			var container
			var panel

			var ensure = function () {
				if (container !== undefined) {
					if (container.isConnected) return
					container.remove()
					container = undefined
					panel = undefined
				}
				var column = conversationColumn()
				if (column === undefined) return
				container = document.createElement('div')
				container.setAttribute(VIEW_ATTR, '')
				container.setAttribute('data-dsh-plugin', 'webchat')
				column.appendChild(container)
				panel = buildPanel(container)
				void panel.refresh()
			}

			var waitObserver = new MutationObserver(function () { ensure() })

			var applyActive = function () {
				if (controller.isOpen()) {
					OTHER_ACTIVE_ATTRS.forEach(function (attr) { document.documentElement.removeAttribute(attr) })
					document.documentElement.setAttribute(ACTIVE_ATTR, '')
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
					ensure()
					if (panel !== undefined) void panel.refresh()
				} else {
					document.documentElement.removeAttribute(ACTIVE_ATTR)
				}
			}
			var onOtherActivate = function (event) {
				var detail = event.detail
				if ((detail === 'taskboard' || detail === 'ssh') && controller.isOpen()) controller.close()
			}
			var SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
			var onClickSidebarRow = function (event) {
				if (!controller.isOpen()) return
				var target = event.target
				if (target === null || target.closest === undefined) return
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close()
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
				if (container !== undefined) container.remove()
				container = undefined
				panel = undefined
			}
		}

		/** Mount the entry and the panel. */
		function apply(ctx) {
			ensureStyle()
			var controller = createController()
			var disposers = [mountSidebarEntry(controller), mountPanel(controller)]
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
