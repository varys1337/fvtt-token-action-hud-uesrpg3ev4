let activeFitting = null

function restoreFont (entry) {
    if (entry.fontSize) entry.label.style.setProperty('font-size', entry.fontSize, entry.fontPriority)
    else entry.label.style.removeProperty('font-size')
}

function removeOwnedAttribute (node, name, value) {
    if (value !== null && node.getAttribute(name) === value) node.removeAttribute(name)
}

function fitLabel (entry, view) {
    const { button, content, label, kind } = entry
    if (!button.isConnected || !button.getClientRects().length || !button.clientWidth || !button.clientHeight) return
    restoreFont(entry)
    label.removeAttribute('data-uesrpg-text-overflow')
    label.removeAttribute('data-uesrpg-text-lines')
    removeOwnedAttribute(button, 'title', entry.title)
    entry.title = null

    const labelStyle = view.getComputedStyle(label)
    const baseline = Number.parseFloat(labelStyle.fontSize)
    if (!Number.isFinite(baseline) || baseline <= 0 || !label.clientWidth) return
    const innerHeight = node => {
        const style = view.getComputedStyle(node)
        return node.clientHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0)
    }
    const availableHeight = Math.min(innerHeight(button), innerHeight(content))
    if (availableHeight <= 0) return
    const fits = () => {
        const style = view.getComputedStyle(label)
        const lineHeight = Number.parseFloat(style.lineHeight)
        const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) return false
        return label.scrollWidth <= label.clientWidth + 1
            && label.scrollHeight <= Math.min(availableHeight, lineHeight * (kind === 'action' ? 2 : 1) + padding) + 1
    }
    if (fits()) return

    const floor = Math.max(baseline * 0.75, baseline >= 10 ? 10 : 0)
    label.style.fontSize = `${floor}px`
    if (!fits()) {
        const style = view.getComputedStyle(label)
        const lineHeight = Number.parseFloat(style.lineHeight)
        const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
        const lines = Number.isFinite(lineHeight) && lineHeight > 0
            ? Math.floor((availableHeight - padding + 0.5) / lineHeight) : 1
        label.dataset.uesrpgTextLines = String(Math.max(1, Math.min(kind === 'action' ? 2 : 1, lines)))
        label.dataset.uesrpgTextOverflow = 'true'
        if (!button.hasAttribute('title') && !button.hasAttribute('data-tooltip')) {
            entry.title = label.textContent.trim()
            button.setAttribute('title', entry.title)
        }
        return
    }
    let low = floor
    let high = baseline
    for (let step = 0; step < 5; step++) {
        const middle = (low + high) / 2
        label.style.fontSize = `${middle}px`
        if (fits()) low = middle
        else high = middle
    }
    label.style.fontSize = `${Math.max(floor, Math.floor(low * 100) / 100)}px`
}

/** Fit Core's plain-text names inside their existing button/content boxes. */
export function attachHudTextFitting (root) {
    detachHudTextFitting()
    if (!root?.querySelectorAll || !root.ownerDocument?.defaultView) return
    const view = root.ownerDocument.defaultView
    const state = { root, view, entries: [], frame: null, observer: null, fonts: root.ownerDocument.fonts }
    activeFitting = state
    const schedule = () => {
        if (activeFitting !== state || state.frame !== null) return
        state.frame = view.requestAnimationFrame(() => {
            state.frame = null
            if (activeFitting !== state || !root.isConnected) return
            for (const entry of state.entries) fitLabel(entry, view)
        })
    }
    state.schedule = schedule
    for (const button of root.querySelectorAll('[data-part="actionButton"], [data-part="groupButton"]')) {
        const content = button.querySelector(':scope > .tah-button-content')
        const label = content?.querySelector(':scope > .tah-button-text')
        if (!label || label.childElementCount || !label.textContent.trim()) continue
        const kind = button.dataset.part === 'actionButton' ? 'action' : 'group'
        const entry = {
            button, content, label, kind,
            fontSize: label.style.getPropertyValue('font-size'),
            fontPriority: label.style.getPropertyPriority('font-size'),
            ariaLabel: null,
            title: null
        }
        if (!button.hasAttribute('aria-label')) {
            entry.ariaLabel = button.textContent.trim().replace(/\s+/g, ' ')
            button.setAttribute('aria-label', entry.ariaLabel)
        }
        button.dataset.uesrpgTextFit = kind
        state.entries.push(entry)
    }

    if (typeof view.ResizeObserver === 'function') {
        const sizes = new WeakMap()
        state.observer = new view.ResizeObserver(entries => {
            let changed = false
            for (const entry of entries) {
                const size = `${entry.contentRect.width}:${entry.contentRect.height}`
                if (sizes.get(entry.target) !== size) changed = true
                sizes.set(entry.target, size)
            }
            if (changed) schedule()
        })
        const observed = new Set()
        for (const { button, content } of state.entries) {
            for (const node of [button, content, ...content.querySelectorAll('.tah-info-container, .tah-info')]) {
                if (observed.has(node)) continue
                observed.add(node)
                state.observer.observe(node)
            }
        }
    }
    state.fonts?.addEventListener('loadingdone', schedule)
    state.fonts?.ready.then(schedule)
    schedule()
}

/** Cancel pending fitting and remove only presentation owned by this module. */
export function detachHudTextFitting () {
    const state = activeFitting
    activeFitting = null
    if (!state) return
    if (state.frame !== null) state.view.cancelAnimationFrame(state.frame)
    state.observer?.disconnect()
    state.fonts?.removeEventListener('loadingdone', state.schedule)
    for (const entry of state.entries) {
        restoreFont(entry)
        removeOwnedAttribute(entry.button, 'data-uesrpg-text-fit', entry.kind)
        entry.label.removeAttribute('data-uesrpg-text-overflow')
        entry.label.removeAttribute('data-uesrpg-text-lines')
        removeOwnedAttribute(entry.button, 'aria-label', entry.ariaLabel)
        removeOwnedAttribute(entry.button, 'title', entry.title)
    }
}
