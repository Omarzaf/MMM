"""Replace <!--FIG:name.svg--> placeholders in the entry page with the SVG source.

The published entry is a single standalone file, as the other entries in the
series are; figures/ stays the canonical source. Re-run after regenerating any
figure. Safe to run repeatedly: an already-inlined figure is re-matched by its
aria-label and swapped for the current file.
"""
import os, re, sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(HERE, "code-donation-meaning-man.html")
FIGS = os.path.join(HERE, "figures")

html = open(PAGE).read()
done = 0
for name in sorted(os.listdir(FIGS)):
    if not name.endswith(".svg"):
        continue
    svg = open(os.path.join(FIGS, name)).read().strip()
    placeholder = "<!--FIG:%s-->" % name
    if placeholder in html:
        html = html.replace(placeholder, svg)
        done += 1
        continue
    # already inlined: swap the existing block for the current source
    label = re.search(r'aria-label="([^"]+)"', svg)
    if label:
        pat = re.compile(
            r'<svg[^>]*aria-label="%s".*?</svg>' % re.escape(label.group(1)), re.S)
        html, n = pat.subn(lambda _m: svg, html)
        done += n

open(PAGE, "w").write(html)
leftover = re.findall(r"<!--FIG:[^>]+-->", html)
print("inlined/refreshed: %d" % done)
if leftover:
    print("UNRESOLVED placeholders: %s" % leftover, file=sys.stderr)
    sys.exit(1)
