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
    } = options
    this.extensions = Array.isArray(extensions) ? extensions : []
    this.htmlExtensions = Array.isArray(htmlExtensions) ? htmlExtensions : []
    this.mathSyntax = { brackets: !!mathSyntax?.brackets, dollars: !!mathSyntax?.dollars }
    this.allowHtml = !!allowHtml
    this.respectNewlines = !!respectNewlines
    this.selectorClassMap = selectorClassMap || {}
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
      if (el) el.innerHTML = html
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
    this.buffer += chunk
    this._schedule()
  }

  flush() {
    this._emit()
  }

  clear() {
    this.buffer = ''
    this._emit('')
  }

  destroy() {
    this.buffer = ''
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
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

  _preprocess(text) {
    if (!this.mathSyntax.brackets) return text
    let out = text
    out = out.replace(/\\{1,2}\[(.*?)\\{1,2}\]/gs, (_, inner) => `$$\n${inner}\n$$`)
    out = out.replace(/\\{1,2}\((.*?)\\{1,2}\)/g, (_, inner) => `$${inner}$`)
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
        if (t.length > 0 && next.trim().length > 0) line = line + "  "
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
}
