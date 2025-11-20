import MarkdownStreamRenderer from './MarkdownStreamRenderer.js'
import katexCss from 'katex/dist/katex.min.css'
import mainRegularWoff2 from 'katex/dist/fonts/KaTeX_Main-Regular.woff2'
import mainItalicWoff2 from 'katex/dist/fonts/KaTeX_Main-Italic.woff2'
import mathItalicWoff2 from 'katex/dist/fonts/KaTeX_Math-Italic.woff2'
import size1RegularWoff2 from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2'
import size2RegularWoff2 from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2'
import size3RegularWoff2 from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2'
import size4RegularWoff2 from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2'

function rewriteKatexCss(css) {
  return css
    .replace(/url\(fonts\/KaTeX_Main-Regular\.woff2\)/g, `url(${mainRegularWoff2})`)
    .replace(/url\(fonts\/KaTeX_Main-Italic\.woff2\)/g, `url(${mainItalicWoff2})`)
    .replace(/url\(fonts\/KaTeX_Math-Italic\.woff2\)/g, `url(${mathItalicWoff2})`)
    .replace(/url\(fonts\/KaTeX_Size1-Regular\.woff2\)/g, `url(${size1RegularWoff2})`)
    .replace(/url\(fonts\/KaTeX_Size2-Regular\.woff2\)/g, `url(${size2RegularWoff2})`)
    .replace(/url\(fonts\/KaTeX_Size3-Regular\.woff2\)/g, `url(${size3RegularWoff2})`)
    .replace(/url\(fonts\/KaTeX_Size4-Regular\.woff2\)/g, `url(${size4RegularWoff2})`)
    .replace(/,\s*url\(fonts\/KaTeX_[^)]+\.woff\)\s*format\('woff'\)/g, '')
    .replace(/,\s*url\(fonts\/KaTeX_[^)]+\.ttf\)\s*format\('truetype'\)/g, '')
}

function injectKatexCss() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-name="katex-injected"]')) return
  const style = document.createElement('style')
  style.setAttribute('data-name', 'katex-injected')
  style.textContent = rewriteKatexCss(katexCss)
  document.head.appendChild(style)
}

injectKatexCss()

export default MarkdownStreamRenderer
