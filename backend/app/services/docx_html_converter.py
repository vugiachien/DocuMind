"""
Custom DOCX → HTML Converter with Comment Range Markers.

Parses the raw Office Open XML inside a .docx file and produces HTML
that embeds <span data-comment-id="X"> at the exact positions defined
by <w:commentRangeStart> / <w:commentRangeEnd>.

This replaces the mammoth library for the preview use-case so that
the frontend can do precise DOM-based comment ↔ text mapping instead
of fragile text-search.
"""

import io
import re
import logging
import xml.etree.ElementTree as ET
from html import escape as html_escape
from zipfile import ZipFile, BadZipFile

logger = logging.getLogger(__name__)

# ── Word XML namespaces ────────────────────────────────────────────────────────
NS = {
    'w':  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r':  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a':  'http://schemas.openxmlformats.org/drawingml/2006/main',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
}

def _tag(ns_prefix: str, local: str) -> str:
    """Build a fully-qualified XML tag name."""
    return f'{{{NS[ns_prefix]}}}{local}'

W = lambda local: _tag('w', local)   # shortcut: W('p') → '{...}p'


class DocxHtmlConverter:
    """
    Stateful converter.  Call ``convert(file_bytes)`` to get an HTML string.
    """

    def __init__(self):
        self._style_map: dict[str, str] = {}     # pStyle val → heading tag
        self._open_comments: list[str] = []       # stack of comment-ids currently open
        self._html_parts: list[str] = []          # output accumulator
        self._rels: dict[str, str] = {}           # rId → target (for hyperlinks)

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    @classmethod
    def convert(cls, file_content: bytes) -> str:
        """
        Convert DOCX bytes → HTML string with embedded comment-range markers.

        Returns HTML wrapped in a styled container <div>.
        """
        converter = cls()
        return converter._do_convert(file_content)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal
    # ──────────────────────────────────────────────────────────────────────────

    def _do_convert(self, file_content: bytes) -> str:
        try:
            with ZipFile(io.BytesIO(file_content)) as zf:
                # 1. Parse styles for heading detection
                if 'word/styles.xml' in zf.namelist():
                    self._parse_styles(zf.read('word/styles.xml'))

                # 2. Parse relationships for hyperlinks
                if 'word/_rels/document.xml.rels' in zf.namelist():
                    self._parse_rels(zf.read('word/_rels/document.xml.rels'))

                # 3. Parse main document body
                if 'word/document.xml' not in zf.namelist():
                    raise ValueError("word/document.xml not found inside .docx")

                doc_xml = zf.read('word/document.xml')
                root = ET.fromstring(doc_xml)

                body = root.find(W('body'))
                if body is None:
                    raise ValueError("<w:body> not found")

                self._process_body(body)

            # Close any still-open comment spans (defensive)
            while self._open_comments:
                self._html_parts.append('</span>')
                self._open_comments.pop()

            inner_html = ''.join(self._html_parts)

            return f'''<div style="font-family: 'Times New Roman', serif; font-size: 16px; line-height: 1.6; padding: 20px; color: #262626;">{inner_html}</div>'''

        except BadZipFile:
            raise ValueError("File is not a valid .docx (ZIP) file")

    # ── Styles ─────────────────────────────────────────────────────────────────

    def _parse_styles(self, styles_xml: bytes):
        """Build mapping from style ID → HTML heading tag (h1-h6)."""
        root = ET.fromstring(styles_xml)
        heading_re = re.compile(r'^[Hh]eading\s*(\d)$')

        for style in root.findall(W('style')):
            style_id = style.get(W('styleId')) or style.get(f'{{{NS["w"]}}}styleId')
            if not style_id:
                continue

            # Check the style name
            name_elem = style.find(W('name'))
            if name_elem is not None:
                name_val = name_elem.get(W('val')) or name_elem.get(f'{{{NS["w"]}}}val') or ''
                m = heading_re.match(name_val)
                if m:
                    level = min(int(m.group(1)), 6)
                    self._style_map[style_id] = f'h{level}'
                    continue

            # Fallback: numeric outlineLvl
            ppr = style.find(W('pPr'))
            if ppr is not None:
                outline = ppr.find(W('outlineLvl'))
                if outline is not None:
                    val = outline.get(W('val')) or outline.get(f'{{{NS["w"]}}}val')
                    if val is not None:
                        level = min(int(val) + 1, 6)
                        self._style_map[style_id] = f'h{level}'

    # ── Relationships ──────────────────────────────────────────────────────────

    def _parse_rels(self, rels_xml: bytes):
        """Parse document.xml.rels for hyperlink targets."""
        root = ET.fromstring(rels_xml)
        for rel in root:
            rid = rel.get('Id')
            target = rel.get('Target')
            rtype = rel.get('Type', '')
            if rid and target and 'hyperlink' in rtype:
                self._rels[rid] = target

    # ── Body traversal ─────────────────────────────────────────────────────────

    def _process_body(self, body):
        """Walk top-level children of <w:body>."""
        for child in body:
            tag = child.tag
            if tag == W('p'):
                self._process_paragraph(child)
            elif tag == W('tbl'):
                self._process_table(child)
            elif tag == W('sdt'):
                # Structured Document Tag — recurse into sdtContent
                sdt_content = child.find(W('sdtContent'))
                if sdt_content is not None:
                    self._process_body(sdt_content)
            # Skip other elements (sectPr, bookmarkStart, etc.)

    # ── Paragraph ──────────────────────────────────────────────────────────────

    def _process_paragraph(self, p_elem):
        """Convert a <w:p> to an HTML paragraph or heading."""
        # Determine tag from style
        html_tag = 'p'
        ppr = p_elem.find(W('pPr'))
        alignment = ''
        indent_style = ''

        if ppr is not None:
            pstyle = ppr.find(W('pStyle'))
            if pstyle is not None:
                val = pstyle.get(W('val')) or pstyle.get(f'{{{NS["w"]}}}val') or ''
                html_tag = self._style_map.get(val, 'p')

            # Alignment
            jc = ppr.find(W('jc'))
            if jc is not None:
                jc_val = jc.get(W('val')) or jc.get(f'{{{NS["w"]}}}val') or ''
                if jc_val == 'center':
                    alignment = 'text-align:center;'
                elif jc_val == 'right':
                    alignment = 'text-align:right;'
                elif jc_val == 'both':
                    alignment = 'text-align:justify;'

            # Indentation
            ind = ppr.find(W('ind'))
            if ind is not None:
                left = ind.get(W('left')) or ind.get(f'{{{NS["w"]}}}left')
                if left:
                    try:
                        px = int(left) // 15  # twips to approx px
                        indent_style = f'margin-left:{px}px;'
                    except ValueError:
                        pass

        style_attr = ''
        combined = alignment + indent_style
        if combined:
            style_attr = f' style="{combined}"'

        # Collect inner content
        inner = self._collect_paragraph_content(p_elem)

        # If paragraph is empty, emit <p><br></p> for spacing (like Word)
        if not inner.strip():
            self._html_parts.append(f'<{html_tag}{style_attr}><br></{html_tag}>')
        else:
            self._html_parts.append(f'<{html_tag}{style_attr}>{inner}</{html_tag}>')

    def _collect_paragraph_content(self, p_elem) -> str:
        """
        Walk children of <w:p> and return inner HTML string.
        Handles: runs, hyperlinks, comment ranges, tabs, breaks.
        """
        parts: list[str] = []

        for child in p_elem:
            tag = child.tag

            if tag == W('r'):
                parts.append(self._process_run(child))

            elif tag == W('hyperlink'):
                parts.append(self._process_hyperlink(child))

            elif tag == W('commentRangeStart'):
                cid = child.get(W('id')) or child.get(f'{{{NS["w"]}}}id')
                if cid:
                    parts.append(f'<span data-comment-id="{html_escape(cid)}" class="comment-range">')
                    self._open_comments.append(cid)

            elif tag == W('commentRangeEnd'):
                cid = child.get(W('id')) or child.get(f'{{{NS["w"]}}}id')
                if cid and cid in self._open_comments:
                    parts.append('</span>')
                    self._open_comments.remove(cid)

            elif tag == W('bookmarkStart') or tag == W('bookmarkEnd'):
                pass  # skip

            elif tag == W('pPr'):
                pass  # already handled

            elif tag == W('commentReference') or tag == W('commentRangeStart') or tag == W('commentRangeEnd'):
                pass  # handled above

            # mc:AlternateContent — recurse into mc:Choice or mc:Fallback
            elif tag == _tag('mc', 'AlternateContent'):
                choice = child.find(_tag('mc', 'Choice'))
                if choice is not None:
                    for sub in choice:
                        if sub.tag == W('r'):
                            parts.append(self._process_run(sub))
                else:
                    fallback = child.find(_tag('mc', 'Fallback'))
                    if fallback is not None:
                        for sub in fallback:
                            if sub.tag == W('r'):
                                parts.append(self._process_run(sub))

        return ''.join(parts)

    # ── Run ────────────────────────────────────────────────────────────────────

    def _process_run(self, r_elem) -> str:
        """Convert a <w:r> (text run) to HTML with formatting."""
        # Detect formatting
        bold = False
        italic = False
        underline = False
        strike = False
        font_size = None
        color = None
        superscript = False
        subscript = False

        rpr = r_elem.find(W('rPr'))
        if rpr is not None:
            if rpr.find(W('b')) is not None:
                b_elem = rpr.find(W('b'))
                val = b_elem.get(W('val')) or b_elem.get(f'{{{NS["w"]}}}val')
                if val is None or val not in ('0', 'false'):
                    bold = True
            if rpr.find(W('i')) is not None:
                i_elem = rpr.find(W('i'))
                val = i_elem.get(W('val')) or i_elem.get(f'{{{NS["w"]}}}val')
                if val is None or val not in ('0', 'false'):
                    italic = True
            if rpr.find(W('u')) is not None:
                u_elem = rpr.find(W('u'))
                val = u_elem.get(W('val')) or u_elem.get(f'{{{NS["w"]}}}val')
                if val and val != 'none':
                    underline = True
            if rpr.find(W('strike')) is not None:
                s_elem = rpr.find(W('strike'))
                val = s_elem.get(W('val')) or s_elem.get(f'{{{NS["w"]}}}val')
                if val is None or val not in ('0', 'false'):
                    strike = True
            # Font size
            sz = rpr.find(W('sz'))
            if sz is not None:
                val = sz.get(W('val')) or sz.get(f'{{{NS["w"]}}}val')
                if val:
                    try:
                        font_size = int(val) // 2  # half-points to pt
                    except ValueError:
                        pass
            # Color
            color_elem = rpr.find(W('color'))
            if color_elem is not None:
                val = color_elem.get(W('val')) or color_elem.get(f'{{{NS["w"]}}}val')
                if val and val != 'auto':
                    color = f'#{val}'
            # Superscript / subscript
            vert = rpr.find(W('vertAlign'))
            if vert is not None:
                val = vert.get(W('val')) or vert.get(f'{{{NS["w"]}}}val')
                if val == 'superscript':
                    superscript = True
                elif val == 'subscript':
                    subscript = True

        # Collect text content from child elements
        text_parts: list[str] = []
        for child in r_elem:
            tag = child.tag
            if tag == W('t'):
                text_parts.append(html_escape(child.text or ''))
            elif tag == W('tab'):
                text_parts.append('&emsp;')
            elif tag == W('br'):
                br_type = child.get(W('type')) or child.get(f'{{{NS["w"]}}}type')
                if br_type == 'page':
                    text_parts.append('<hr style="page-break-after:always;">')
                else:
                    text_parts.append('<br>')
            elif tag == W('cr'):
                text_parts.append('<br>')
            elif tag == W('commentReference'):
                pass  # skip the little comment-reference marker
            elif tag == W('drawing') or tag == W('pict'):
                text_parts.append('[image]')  # placeholder for images

        content = ''.join(text_parts)
        if not content:
            return ''

        # Wrap in formatting tags
        if bold:
            content = f'<strong>{content}</strong>'
        if italic:
            content = f'<em>{content}</em>'
        if underline:
            content = f'<u>{content}</u>'
        if strike:
            content = f'<s>{content}</s>'
        if superscript:
            content = f'<sup>{content}</sup>'
        if subscript:
            content = f'<sub>{content}</sub>'

        # Inline style for color / font-size
        inline_styles = []
        if font_size and font_size != 12:  # skip default
            inline_styles.append(f'font-size:{font_size}pt')
        if color:
            inline_styles.append(f'color:{color}')

        if inline_styles:
            content = f'<span style="{";".join(inline_styles)}">{content}</span>'

        return content

    # ── Hyperlink ──────────────────────────────────────────────────────────────

    def _process_hyperlink(self, hl_elem) -> str:
        """Convert <w:hyperlink> to <a> tag."""
        rid = hl_elem.get(_tag('r', 'id'))
        href = self._rels.get(rid, '#') if rid else '#'

        parts: list[str] = []
        for child in hl_elem:
            if child.tag == W('r'):
                parts.append(self._process_run(child))
            elif child.tag == W('commentRangeStart'):
                cid = child.get(W('id')) or child.get(f'{{{NS["w"]}}}id')
                if cid:
                    parts.append(f'<span data-comment-id="{html_escape(cid)}" class="comment-range">')
                    self._open_comments.append(cid)
            elif child.tag == W('commentRangeEnd'):
                cid = child.get(W('id')) or child.get(f'{{{NS["w"]}}}id')
                if cid and cid in self._open_comments:
                    parts.append('</span>')
                    self._open_comments.remove(cid)

        inner = ''.join(parts)
        return f'<a href="{html_escape(href)}" target="_blank" rel="noopener">{inner}</a>'

    # ── Table ──────────────────────────────────────────────────────────────────

    def _process_table(self, tbl_elem):
        """Convert <w:tbl> to <table>."""
        self._html_parts.append(
            '<table style="border-collapse:collapse;width:100%;margin:16px 0;">'
        )
        for child in tbl_elem:
            if child.tag == W('tr'):
                self._process_table_row(child)
        self._html_parts.append('</table>')

    def _process_table_row(self, tr_elem):
        """Convert <w:tr> to <tr>."""
        self._html_parts.append('<tr>')
        for child in tr_elem:
            if child.tag == W('tc'):
                self._process_table_cell(child)
        self._html_parts.append('</tr>')

    def _process_table_cell(self, tc_elem):
        """Convert <w:tc> to <td>."""
        # Check for gridSpan (colspan)
        colspan = ''
        tcpr = tc_elem.find(W('tcPr'))
        if tcpr is not None:
            gs = tcpr.find(W('gridSpan'))
            if gs is not None:
                val = gs.get(W('val')) or gs.get(f'{{{NS["w"]}}}val')
                if val and int(val) > 1:
                    colspan = f' colspan="{val}"'

            # Check for vMerge (rowspan) — simplified: skip "continue" cells
            vm = tcpr.find(W('vMerge'))
            if vm is not None:
                val = vm.get(W('val')) or vm.get(f'{{{NS["w"]}}}val')
                if val is None:
                    # This is a continuation cell — skip it
                    return

        self._html_parts.append(
            f'<td{colspan} style="border:1px solid #d9d9d9;padding:8px;vertical-align:top;">'
        )
        for child in tc_elem:
            if child.tag == W('p'):
                self._process_paragraph(child)
            elif child.tag == W('tbl'):
                self._process_table(child)  # nested tables
        self._html_parts.append('</td>')
