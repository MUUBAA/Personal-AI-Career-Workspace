import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopPosition, TabStopType, TextRun } from "docx";
import { bullets } from "./store";

// pt = body font size the on-screen preview needed to fit one A4 page; everything scales with it.
// shortcut: Word's line metrics differ slightly from the browser, so a resume right at the limit can still spill in Word; the PDF is exact.
export async function exportDocx(d, hidden = [], filename = "resume", pt = 10.5) {
  const k = pt / 10.5, sz = (n) => Math.round(n * k);
  const heading = (t) => new Paragraph({
    spacing: { before: sz(160), after: sz(50) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
    children: [new TextRun({ text: t.toUpperCase(), bold: true })],
  });
  const bullet = (t) => new Paragraph({ text: t, bullet: { level: 0 }, keepLines: true });
  const on = (s) => !hidden.includes(s);
  const kids = [
    new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: d.name || "Your Name", bold: true, size: sz(36) })] }),
    new Paragraph({ text: [d.email, d.phone, d.location, d.links].filter(Boolean).join(" | ") }),
  ];
  if (on("summary") && d.summary) kids.push(heading("Summary"), new Paragraph({ text: d.summary }));
  if (on("skills") && d.skills) kids.push(heading("Skills"), new Paragraph({ text: d.skills }));
  if (on("experience")) {
    kids.push(heading("Experience"));
    for (const j of d.jobs) {
      if (!j.role && !j.company) continue;
      kids.push(new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        spacing: { before: sz(70) }, keepNext: true,
        children: [new TextRun({ text: [j.role, j.company].filter(Boolean).join(", "), bold: true }), new TextRun({ text: `\t${j.dates}`, bold: true })],
      }), ...bullets(j.bullets).map(bullet));
    }
  }
  if (on("projects") && d.projects) kids.push(heading("Projects"), ...bullets(d.projects).map(bullet));
  if (on("education") && d.education) kids.push(heading("Education"), ...bullets(d.education).map((t) => new Paragraph({ text: t })));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: Math.round(pt * 2) }, paragraph: { spacing: { after: 0, line: 252 } } } } },
    // A4, 12 mm margins (680 twips), same page as the PDF
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 680, bottom: 680, left: 680, right: 680 } } }, children: kids }],
  });
  const url = URL.createObjectURL(await Packer.toBlob(doc));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${filename.replace(/[^\w.-]+/g, "_")}.docx` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
