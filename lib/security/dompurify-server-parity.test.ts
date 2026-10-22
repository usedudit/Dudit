import { describe, it, expect } from "vitest"
import { sanitizeRichText } from "./rich-text-sanitizer"
import serverDOMPurify from "./dompurify-server"

const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div", "img", "a", "font", "blockquote", "code", "pre", "hr",
]

const ALLOWED_ATTR = [
  "style", "class", "className", "src", "alt", "width", "height",
  "href", "target", "rel", "color", "align", "title",
]

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target"],
}

const corpus = [
  "<p>Texto simples</p>",
  '<p style="color: #2563eb;">Texto <strong>negrito</strong> e <em>italico</em>.</p>',
  "<h1>Titulo</h1><h2>Subtitulo</h2><ul><li>Um</li><li>Dois</li></ul>",
  "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>",
  '<img src="https://example.com/a.png" alt="A" width="10" height="10" />',
  '<a href="https://example.com" target="_blank" rel="noopener">Link</a>',
  "<blockquote>Citacao</blockquote><pre><code>codigo</code></pre><hr>",
  "<p>Texto<br>com quebra</p>",
  "<div><span class=\"x\">A</span><font color=\"red\">B</font></div>",
  "<p>Antes</p><script>alert(1)</script><p>Depois</p>",
  '<img src="x" onerror="alert(1)">',
  '<a href="javascript:alert(1)">Clique</a>',
  '<iframe src="https://evil.com"></iframe>',
  '<svg><script>alert(1)</script></svg>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
  "<p>Texto <b>negrito</b></p><!-- comentario -->",
  "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  '<a href="https://example.com" onclick="alert(1)">Link</a>',
  '<p data-secret="x">Conteudo</p>',
  "<p>Texto <unknown>custom</unknown></p>",
]

describe("Server DOMPurify parity with isomorphic-dompurify", () => {
  for (const input of corpus) {
    it(`matches for ${input.slice(0, 60)}`, () => {
      expect(serverDOMPurify.sanitize(input, CONFIG)).toBe(sanitizeRichText(input))
    })
  }
})
