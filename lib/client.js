/**
 * dsh-webchat — browser half.
 *
 * One sidebar entry. Clicking it opens the official DeepSeek web app in a
 * window (see lib/index.js) and reports the outcome in a short toast. There is
 * no panel and no in-GUI chat: chat.deepseek.com cannot be framed
 * (`frame-ancestors 'none'`) and this build has `webviewTag: false`, so the
 * official page can only live in a window of its own.
 *
 * Everything here is plain DOM — no React, no build step. The shell exposes no
 * slot an external plugin can register into, so the entry row is injected at
 * the DOM level and self-heals against React re-renders.
 */
window.__ModuleLoader__.load({
	id: "@jaychang1989/dsh-webchat",
	factory: () => {
		var module = { exports: {} }
		var exports = module.exports

		/** Routes served by lib/index.js. */
		var API = { open: '/api/dsh-webchat/open' }
		var ENTRY_ATTR = 'data-dsh-webchat-entry'
		var STYLE_ID = 'dsh-webchat-style'
		var TOAST_ATTR = 'data-dsh-webchat-toast'

		var ZH = typeof navigator === 'object' && typeof navigator.language === 'string'
			&& navigator.language.toLowerCase().indexOf('zh') === 0

		/** Surface copy; the plugin ships both languages rather than a locale service. */
		var T = ZH
			? {
				label: 'DeepSeek 网页',
				tooltip: '打开 chat.deepseek.com',
				busy: '正在打开…',
				opened: '已打开 DeepSeek 网页',
				handed: '已交给系统默认浏览器打开',
				failed: '打开失败',
			}
			: {
				label: 'DeepSeek Web',
				tooltip: 'Open chat.deepseek.com',
				busy: 'Opening…',
				opened: 'DeepSeek Web is open',
				handed: 'Handed to the system default browser',
				failed: 'Could not open',
			}

		/** Entry and toast styling, scoped to this plugin's own attribute. */
		var CSS = [
			'[' + ENTRY_ATTR + ']{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 12px;background:transparent;border:none;border-radius:8px;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;white-space:nowrap}',
			'[' + ENTRY_ATTR + ']:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
			'[' + ENTRY_ATTR + '][disabled]{opacity:.55;cursor:progress}',
			'[' + ENTRY_ATTR + '] [data-part=icon]{display:inline-flex;align-items:center;justify-content:center;flex:none}',
			'[' + ENTRY_ATTR + '] [data-part=label]{overflow:hidden;text-overflow:ellipsis}',
			'[data-dsh-frame][data-sidebar-collapsed] [' + ENTRY_ATTR + ']{justify-content:center;padding:0}',
			'[data-dsh-frame][data-sidebar-collapsed] [' + ENTRY_ATTR + '] [data-part=label]{display:none}',
			'[' + TOAST_ATTR + ']{position:fixed;right:20px;bottom:20px;z-index:200;max-width:420px;padding:10px 14px;border-radius:10px;background:var(--dsw-alias-bg-elevated);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:13px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
			'[' + TOAST_ATTR + '][data-state=bad]{border-color:var(--dsw-alias-state-danger,#ef4444);color:var(--dsw-alias-state-danger,#ef4444)}',
		].join('\n')

		/** Inject the stylesheet once. */
		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return
			var tag = document.createElement('style')
			tag.id = STYLE_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
		}

		/** Show one transient message next to the panel corner. */
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

		/** Call the host route; a non-JSON or non-2xx answer becomes an error field. */
		async function openPage() {
			const response = await fetch(API.open, { method: 'POST', headers: { accept: 'application/json' } })
			let payload = {}
			try { payload = await response.json() } catch (error) { payload = {} }
			if (!response.ok && payload.error === undefined) payload.error = 'HTTP ' + response.status
			return payload
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
		function createEntry() {
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

			entry.addEventListener('click', async function () {
				if (entry.disabled) return
				entry.disabled = true
				var labelNode = entry.querySelector('[data-part=label]')
				if (labelNode !== null) labelNode.textContent = T.busy
				try {
					var outcome = await openPage()
					if (outcome.ok === true) {
						toast(String(outcome.via) === 'system-browser' ? T.handed : T.opened)
					} else {
						toast(T.failed + '：' + String(outcome.error || outcome.via || ''), 'bad')
					}
				} catch (error) {
					toast(T.failed + '：' + (error instanceof Error ? error.message : String(error)), 'bad')
				}
				if (labelNode !== null) labelNode.textContent = T.label
				entry.disabled = false
			})

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
		function mountSidebarEntry() {
			if (document.querySelector('[' + ENTRY_ATTR + ']') !== null) return function () {}
			var entry = createEntry()
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

			tryPlace()

			return function () {
				waitObserver.disconnect()
				rootObserver.disconnect()
				entry.remove()
			}
		}

		/** Mount the entry. */
		function apply(ctx) {
			ensureStyle()
			var dispose = mountSidebarEntry()
			ctx.effect(function () {
				return function () { dispose() }
			}, 'dsh-webchat: sidebar entry')
		}

		exports.apply = apply
		exports.inject = []
		return module.exports
	},
})
