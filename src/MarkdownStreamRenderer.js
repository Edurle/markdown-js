import { micromark } from 'micromark'
import DOMPurify from 'dompurify'
import { math, mathHtml } from 'micromark-extension-math'

export default class MarkdownStreamRenderer {
  constructor(options = {}) {
    const {
      extensions = [],
      htmlExtensions = [],
      sanitizeOptions = {},
      throttleMs = 16,
      onChunk,
      useMath = true,
      katexOptions = {},
      mathOptions = { singleDollarTextMath: true },
      mathSyntax = { brackets: true, dollars: false },
      allowHtml = true,
      katexCssOverrides = '',
      katexStylePreset = 'academic',
      respectNewlines = false,
      cssOverrides = '',
      selectorClassMap = null,
      typewriter = { enabled: false, intervalMs: 24, step: 1 },
    } = options
    this.extensions = Array.isArray(extensions) ? extensions : []
    this.htmlExtensions = Array.isArray(htmlExtensions) ? htmlExtensions : []
    this.mathSyntax = { brackets: !!mathSyntax?.brackets, dollars: !!mathSyntax?.dollars }
    this.allowHtml = !!allowHtml
    this.respectNewlines = !!respectNewlines
    this.selectorClassMap = selectorClassMap || {}
    const tw = typewriter || {}
    this.typewriter = {
      enabled: !!tw.enabled,
      intervalMs: typeof tw.intervalMs === 'number' ? tw.intervalMs : 24,
      step: typeof tw.step === 'number' && tw.step > 0 ? tw.step : 1,
    }
    this.twQueue = []
    this.twTimer = null
    let css = katexCssOverrides
    if (!css && katexStylePreset === 'academic') {
      css = `
        .katex { font-size: 1.06em; }
        .katex-display { text-align: left; margin: 1.1em 0; padding-left: 2em; }
        .katex .frac-line { border-top-width: 2px; }
        .katex .sqrt-line { border-top-width: 2px; }
        .katex .underline { text-decoration-thickness: .08em; }
      `
    }
    if (typeof document !== 'undefined' && css) {
      if (!document.querySelector('style[data-name="katex-overrides"]')) {
        const s = document.createElement('style')
        s.setAttribute('data-name', 'katex-overrides')
        s.textContent = css
        document.head.appendChild(s)
      }
    }

    if (typeof document !== 'undefined') {
      const cssText = typeof cssOverrides === 'string' ? cssOverrides : this._cssFromMap(cssOverrides)
      if (cssText && !document.querySelector('style[data-name="md-overrides"]')) {
        const s = document.createElement('style')
        s.setAttribute('data-name', 'md-overrides')
        s.textContent = cssText
        document.head.appendChild(s)
      }
    }
    if (useMath) {
      const ko = { throwOnError: false, ...katexOptions }
      const defaultMacros = {
        "\\dint": "\\displaystyle\\int",
        "\\dd": "\\,\\mathrm{d}",
        "\\mat": "\\begin{bmatrix}#1\\end{bmatrix}",
        "\\vect": "\\boldsymbol{#1}"
      }
      ko.macros = { ...defaultMacros, ...(ko.macros || {}) }
      this.katexKo = ko
      const mo = { ...mathOptions }
      if (!this.mathSyntax.dollars) mo.singleDollarTextMath = false
      this.extensions.unshift(math(mo))
      this.htmlExtensions.unshift(mathHtml(ko))
    }
    this.sanitizeOptions = sanitizeOptions || {}
    this.throttleMs = typeof throttleMs === 'number' ? throttleMs : 16
    this.buffer = ''
    this.timer = null
    this.listener = typeof onChunk === 'function' ? onChunk : null
    this.prevHtml = ''
  }

  registerExtensions(exts) {
    if (Array.isArray(exts)) this.extensions.push(...exts)
  }

  registerHtmlExtensions(exts) {
    if (Array.isArray(exts)) this.htmlExtensions.push(...exts)
  }

  setSanitizeOptions(opts) {
    this.sanitizeOptions = opts || {}
  }

  on(fn) {
    this.listener = typeof fn === 'function' ? fn : null
  }

  renderTo(el) {
    if (!el) return
    this.on((html) => {
      if (el && html !== this.prevHtml) {
        el.innerHTML = html
        this.prevHtml = html
      }
      if (this.selectorClassMap && el) {
        for (const k in this.selectorClassMap) {
          const cls = this.selectorClassMap[k]
          if (!cls) continue
          el.querySelectorAll(k).forEach((node) => {
            const list = Array.isArray(cls) ? cls : String(cls).split(/\s+/)
            list.forEach((c) => c && node.classList.add(c))
          })
        }
      }
    })
  }

  write(chunk) {
    if (typeof chunk !== 'string' || !chunk) return
    if (this.typewriter.enabled) {
      this.twQueue.push(chunk)
      this._startTypewriter()
      return
    }
    this.buffer += chunk
    this._schedule()
  }

  flush() {
    this._emit()
  }

  clear() {
    this.buffer = ''
    this.twQueue = []
    if (this.twTimer) { clearInterval(this.twTimer); this.twTimer = null }
    this._emit('')
  }

  destroy() {
    this.buffer = ''
    this.twQueue = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.twTimer) {
      clearInterval(this.twTimer)
      this.twTimer = null
    }
    this.listener = null
  }

  _schedule() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this._emit()
    }, this.throttleMs)
  }

  _emit(forceHtml) {
    let html
    try {
      const source = typeof forceHtml === 'string' ? forceHtml : this._preprocess(this.buffer)
      html = micromark(source, {
            extensions: this.extensions,
            htmlExtensions: this.htmlExtensions,
            allowDangerousHtml: this.allowHtml,
          })
    } catch (_err) {
      html = micromark(this.buffer, { allowDangerousHtml: this.allowHtml })
    }
    const safe = DOMPurify.sanitize(html, this.sanitizeOptions)
    if (this.listener) this.listener(safe)
    return safe
  }

  _startTypewriter() {
    if (this.twTimer) return
    this.twTimer = setInterval(() => {
      if (this.twQueue.length === 0) {
        clearInterval(this.twTimer)
        this.twTimer = null
        return
      }
      const current = this.twQueue[0]
      const take = current.slice(0, this.typewriter.step)
      const rest = current.slice(this.typewriter.step)
      if (rest.length > 0) {
        this.twQueue[0] = rest
      } else {
        this.twQueue.shift()
      }
      this.buffer += take
      this._schedule()
    }, this.typewriter.intervalMs)
  }

  _preprocess(text) {
    if (!this.mathSyntax.brackets) return text
    let out = text
    out = out.replace(/\\{1,2}\[(.*?)\\{1,2}\]/gs, (_, inner) => `$$\n${inner}\n$$`)
    out = out.replace(/\\{1,2}\((.*?)\\{1,2}\)/g, (_, inner) => `$${inner}$`)
    if (this.mathSyntax.dollars) out = this._normalizeInlineDollars(out)
    if (this.respectNewlines) out = this._applyHardBreaks(out)
    return out
  }

  _applyHardBreaks(input) {
    const lines = input.replace(/\r\n/g, "\n").split("\n")
    const res = []
    let code = false
    let math = false
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      const t = line.trim()
      if ((t.startsWith("```") || t.startsWith("~~~"))) {
        code = !code
        res.push(line)
        continue
      }
      if (t.startsWith("$$") && !code) {
        math = !math
        res.push(line)
        continue
      }
      if (!code && !math) {
        const next = i < lines.length - 1 ? lines[i + 1] : ""
        const nt = next.trim()
        const blockStart = /^(#{1,6}\s|>\s|([-+*])\s|\d+\.\s|(```|~~~)|\s*<|\s*$)/.test(nt)
        const closingHtmlBlock = /^<\/(div|p|section|article|header|footer|table|ul|ol|li|pre|blockquote)>\s*$/.test(t)
        if (t.length > 0 && nt.length > 0 && !blockStart && !/\s\s$/.test(line)) {
          line = line + "  "
        }
        if (closingHtmlBlock && nt.length > 0 && !blockStart) {
          res.push(line)
          res.push("")
          continue
        }
      }
      res.push(line)
    }
    return res.join("\n")
  }

  _cssFromMap(map) {
    if (!map || typeof map !== 'object') return ''
    let out = ''
    for (const sel in map) {
      const rules = map[sel]
      if (!rules || typeof rules !== 'object') continue
      const body = Object.entries(rules)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ')
      out += `${sel} { ${body} }\n`
    }
    return out
  }

  _normalizeInlineDollars(input) {
    const lines = input.replace(/\r\n/g, "\n").split("\n")
    let code = false
    let blockMath = false
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if ((t.startsWith("```") || t.startsWith("~~~"))) {
        code = !code
        continue
      }
      if (t.startsWith("$$") && !code) {
        blockMath = !blockMath
        continue
      }
      if (code || blockMath) continue
      let line = lines[i]
      line = line.replace(/(?<![$\s])\$(?!\$)/g, ' $')
      line = line.replace(/(?<!\$)\$(?![\$\s])/g, '$ ')
      lines[i] = line
    }
    return lines.join("\n")
  }
  update(text) {
    if (typeof text !== 'string') return
    if (this.typewriter.enabled) {
      const old = this.buffer
      const newStr = text
      let i = 0
      const max = Math.min(old.length, newStr.length)
      while (i < max && old.charCodeAt(i) === newStr.charCodeAt(i)) i++
      const isInitial = old.length === 0 && newStr.length > 0
      const isAppend = i === old.length && newStr.length > old.length
      if (isInitial) {
        this.twQueue.push(newStr)
        this._startTypewriter()
        return
      }
      if (isAppend) {
        const delta = newStr.slice(i)
        if (delta) {
          this.twQueue.push(delta)
          this._startTypewriter()
        }
        return
      }
      this.twQueue.length = 0
      if (this.twTimer) { clearInterval(this.twTimer); this.twTimer = null }
      this.buffer = newStr
      this._schedule()
      return
    }
    this.buffer = text
    this._schedule()
  }
}
