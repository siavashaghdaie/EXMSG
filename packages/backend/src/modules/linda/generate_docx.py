#!/usr/bin/env python3
"""
Generate a valid .docx file from markdown-like content.
Uses only Python standard library (zipfile, xml.etree).

Usage:
    python3 generate_docx.py --output path.docx --title "Title" --content-file /tmp/content.txt
"""

import argparse
import json
import os
import re
import sys
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring

WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
OFFICE_DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument'

def make_content_types():
    types = Element('Types', xmlns=CT_NS)
    SubElement(types, 'Default', Extension='rels',
               ContentType='application/vnd.openxmlformats-package.relationships+xml')
    SubElement(types, 'Default', Extension='xml', ContentType='application/xml')
    SubElement(types, 'Override', PartName='/word/document.xml',
               ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(types, encoding='unicode')

def make_root_rels():
    rels = Element('Relationships', xmlns=REL_NS)
    SubElement(rels, 'Relationship', Id='rId1', Type=OFFICE_DOC_REL, Target='word/document.xml')
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(rels, encoding='unicode')

def make_doc_rels():
    rels = Element('Relationships', xmlns=REL_NS)
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(rels, encoding='unicode')

def parse_inline(text):
    """Parse **bold** and *italic* from text, return list of (text, bold, italic)."""
    runs = []
    pattern = r'(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))'
    for m in re.finditer(pattern, text):
        if m.group(2):
            runs.append((m.group(2), True, True))
        elif m.group(3):
            runs.append((m.group(3), True, False))
        elif m.group(4):
            runs.append((m.group(4), False, True))
        elif m.group(5):
            runs.append((m.group(5), False, False))
    return runs if runs else [(text, False, False)]

def add_run(parent, text, font='Calibri', size=22, bold=False, italic=False, color='333333'):
    """Add a w:r element with formatted text."""
    W = WORD_NS
    r = SubElement(parent, f'{{{W}}}r')
    rpr = SubElement(r, f'{{{W}}}rPr')
    rf = SubElement(rpr, f'{{{W}}}rFonts')
    rf.set(f'{{{W}}}ascii', font)
    rf.set(f'{{{W}}}hAnsi', font)
    rf.set(f'{{{W}}}cs', font)
    sz = SubElement(rpr, f'{{{W}}}sz')
    sz.set(f'{{{W}}}val', str(size))
    szcs = SubElement(rpr, f'{{{W}}}szCs')
    szcs.set(f'{{{W}}}val', str(size))
    if bold:
        SubElement(rpr, f'{{{W}}}b')
        SubElement(rpr, f'{{{W}}}bCs')
    if italic:
        SubElement(rpr, f'{{{W}}}i')
        SubElement(rpr, f'{{{W}}}iCs')
    c = SubElement(rpr, f'{{{W}}}color')
    c.set(f'{{{W}}}val', color)
    t = SubElement(r, f'{{{W}}}t')
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    t.text = text

def add_paragraph_props(p, spacing_before=0, spacing_after=120, line=276, indent_left=0, indent_hanging=0, jc=None, border_bottom=None, border_left=None, shading=None):
    """Add paragraph properties."""
    W = WORD_NS
    ppr = SubElement(p, f'{{{W}}}pPr')
    if jc:
        j = SubElement(ppr, f'{{{W}}}jc')
        j.set(f'{{{W}}}val', jc)
    sp = SubElement(ppr, f'{{{W}}}spacing')
    if spacing_before:
        sp.set(f'{{{W}}}before', str(spacing_before))
    sp.set(f'{{{W}}}after', str(spacing_after))
    if line:
        sp.set(f'{{{W}}}line', str(line))
        sp.set(f'{{{W}}}lineRule', 'auto')
    if indent_left or indent_hanging:
        ind = SubElement(ppr, f'{{{W}}}ind')
        if indent_left:
            ind.set(f'{{{W}}}left', str(indent_left))
        if indent_hanging:
            ind.set(f'{{{W}}}hanging', str(indent_hanging))
    if border_bottom or border_left:
        pbdr = SubElement(ppr, f'{{{W}}}pBdr')
        if border_bottom:
            bb = SubElement(pbdr, f'{{{W}}}bottom')
            bb.set(f'{{{W}}}val', 'single')
            bb.set(f'{{{W}}}sz', str(border_bottom.get('sz', 6)))
            bb.set(f'{{{W}}}space', '1')
            bb.set(f'{{{W}}}color', border_bottom.get('color', 'CCCCCC'))
        if border_left:
            bl = SubElement(pbdr, f'{{{W}}}left')
            bl.set(f'{{{W}}}val', 'single')
            bl.set(f'{{{W}}}sz', str(border_left.get('sz', 18)))
            bl.set(f'{{{W}}}space', '8')
            bl.set(f'{{{W}}}color', border_left.get('color', '1A568E'))
    if shading:
        shd = SubElement(ppr, f'{{{W}}}shd')
        shd.set(f'{{{W}}}val', 'clear')
        shd.set(f'{{{W}}}color', 'auto')
        shd.set(f'{{{W}}}fill', shading)
    return ppr

def make_document(title, content):
    """Build document.xml from markdown-like content."""
    W = WORD_NS

    # Register namespace to avoid ns0: prefix
    import xml.etree.ElementTree as ET
    ET.register_namespace('w', W)
    ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    ET.register_namespace('mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006')

    doc = Element(f'{{{W}}}document')
    doc.set(f'xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    body = SubElement(doc, f'{{{W}}}body')

    # Title paragraph
    p = SubElement(body, f'{{{W}}}p')
    add_paragraph_props(p, spacing_after=120, jc='center', line=None)
    add_run(p, title, size=56, bold=True, color='1A568E')

    # Separator line
    p = SubElement(body, f'{{{W}}}p')
    add_paragraph_props(p, spacing_after=300, border_bottom={'sz': 12, 'color': '1A568E'}, line=None)

    # Parse content
    heading_colors = {1: '1A568E', 2: '1E6BB8', 3: '2980B9', 4: '3498DB', 5: '5DADE2', 6: '7FB3D8'}
    heading_sizes = {1: 48, 2: 40, 3: 32, 4: 28, 5: 26, 6: 24}
    num_idx = 0
    lines = content.split('\n')

    for line in lines:
        # HR
        if re.match(r'^(-{3,}|\*{3,}|_{3,})\s*$', line):
            p = SubElement(body, f'{{{W}}}p')
            add_paragraph_props(p, spacing_before=120, spacing_after=120,
                              border_bottom={'sz': 6, 'color': 'CCCCCC'}, line=None)
            num_idx = 0
            continue

        # Heading
        hm = re.match(r'^(#{1,6})\s+(.+)', line)
        if hm:
            level = len(hm.group(1))
            text = hm.group(2).strip()
            p = SubElement(body, f'{{{W}}}p')
            sb = 240 if level <= 2 else 160
            add_paragraph_props(p, spacing_before=sb, spacing_after=120, line=None)
            for txt, bold, italic in parse_inline(text):
                add_run(p, txt, size=heading_sizes.get(level, 28), bold=True,
                       italic=italic, color=heading_colors.get(level, '1A568E'))
            num_idx = 0
            continue

        # Bullet
        bm = re.match(r'^\s*[-*+]\s+(.+)', line)
        if bm:
            text = bm.group(1).strip()
            p = SubElement(body, f'{{{W}}}p')
            add_paragraph_props(p, spacing_after=60, indent_left=720, indent_hanging=360)
            add_run(p, '\u2022  ', size=22, color='1A568E')
            for txt, bold, italic in parse_inline(text):
                add_run(p, txt, size=22, bold=bold, italic=italic, color='333333')
            num_idx = 0
            continue

        # Numbered
        nm = re.match(r'^\s*(\d+)[.)]\s+(.+)', line)
        if nm:
            num_idx += 1
            text = nm.group(2).strip()
            p = SubElement(body, f'{{{W}}}p')
            add_paragraph_props(p, spacing_after=60, indent_left=720, indent_hanging=360)
            add_run(p, f'{num_idx}.  ', size=22, color='1A568E')
            for txt, bold, italic in parse_inline(text):
                add_run(p, txt, size=22, bold=bold, italic=italic, color='333333')
            continue

        # Blockquote
        qm = re.match(r'^>\s*(.*)', line)
        if qm:
            text = qm.group(1).strip()
            p = SubElement(body, f'{{{W}}}p')
            add_paragraph_props(p, spacing_after=120, indent_left=480,
                              border_left={'sz': 18, 'color': '1A568E'}, shading='F0F4F8')
            for txt, bold, italic in parse_inline(text):
                add_run(p, txt, size=22, bold=bold, italic=True, color='555555')
            continue

        # Empty line
        if not line.strip():
            num_idx = 0
            continue

        # Regular paragraph
        p = SubElement(body, f'{{{W}}}p')
        add_paragraph_props(p, spacing_after=120)
        for txt, bold, italic in parse_inline(line.strip()):
            add_run(p, txt, size=22, bold=bold, italic=italic, color='333333')
        num_idx = 0

    # Section properties (US Letter, 1" margins)
    sectpr = SubElement(body, f'{{{W}}}sectPr')
    pgsz = SubElement(sectpr, f'{{{W}}}pgSz')
    pgsz.set(f'{{{W}}}w', '12240')
    pgsz.set(f'{{{W}}}h', '15840')
    pgmar = SubElement(sectpr, f'{{{W}}}pgMar')
    for attr, val in [('top', '1440'), ('right', '1440'), ('bottom', '1440'),
                      ('left', '1440'), ('header', '720'), ('footer', '720'), ('gutter', '0')]:
        pgmar.set(f'{{{W}}}' + attr, val)

    xml_str = tostring(doc, encoding='unicode')
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml_str

def create_docx(output_path, title, content):
    """Create a valid .docx file."""
    ct = make_content_types()
    root_rels = make_root_rels()
    doc_rels = make_doc_rels()
    doc_xml = make_document(title, content)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', ct)
        zf.writestr('_rels/.rels', root_rels)
        zf.writestr('word/_rels/document.xml.rels', doc_rels)
        zf.writestr('word/document.xml', doc_xml)

    return os.path.getsize(output_path)

def main():
    parser = argparse.ArgumentParser(description='Generate a .docx file')
    parser.add_argument('--output', required=True, help='Output .docx path')
    parser.add_argument('--title', default='Document', help='Document title')
    parser.add_argument('--content-file', required=True, help='Path to content text file')
    args = parser.parse_args()

    with open(args.content_file, 'r', encoding='utf-8') as f:
        content = f.read()

    size = create_docx(args.output, args.title, content)
    print(f'OK:{size}')

if __name__ == '__main__':
    main()
