// One-click PDF export. Libraries and font load only when someone clicks "export pdf".
(function () {
  let ready = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("couldn't load " + src));
      document.head.appendChild(s);
    });
  }
  async function fontB64(path) {
    const buf = await (await fetch(path)).arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function load() {
    if (!ready) {
      ready = (async () => {
        await loadScript("vendor/jspdf.umd.min.js");
        await loadScript("vendor/jspdf.plugin.autotable.min.js");
        const [reg, bold] = await Promise.all([fontB64("vendor/DejaVuSans.ttf"), fontB64("vendor/DejaVuSans-Bold.ttf")]);
        return { reg, bold };
      })().catch((e) => { ready = null; throw e; });
    }
    return ready;
  }

  // Emoji aren't in the PDF font — drop them rather than print empty boxes.
  const clean = (v) => String(v ?? "").replace(/[\u{1F000}-\u{1FAFF}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s+/g, " ").trim();

  window.exportPdf = async function ({ source, accent, title, subtitle, head, body, filename, dateCols = [0] }) {
    const fonts = await load();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    doc.addFileToVFS("DejaVuSans.ttf", fonts.reg);
    doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
    doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");

    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
    // Dark theme, matching the site
    const BG = [10, 10, 10], TEXT = [242, 242, 242], MUTED = [138, 138, 138], LINE = [34, 34, 34], ALT = [18, 18, 18];
    const paint = () => { doc.setFillColor(...BG); doc.rect(0, 0, W, H, "F"); };
    paint();
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    doc.setFillColor(...accent);
    doc.rect(0, 0, W, 6, "F");
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(`IT WAS IN MY LIKES FIRST  ·  ${source.toUpperCase()}`, M, 34);
    doc.setTextColor(...TEXT);
    doc.setFontSize(20);
    doc.text(clean(title), M, 60);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${clean(subtitle)}  ·  exported ${today}`, M, 76);

    doc.autoTable({
      startY: 92,
      margin: { left: M, right: M, bottom: 40 },
      head: [head],
      body: body.map((r) => r.map(clean)),
      styles: { font: "DejaVu", fontSize: 8.5, cellPadding: 5, fillColor: BG, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.5 }, overflow: "linebreak" },
      headStyles: { font: "DejaVu", fontStyle: "bold", fillColor: BG, textColor: MUTED, lineColor: accent, lineWidth: { bottom: 1 } },
      alternateRowStyles: { fillColor: ALT },
      columnStyles: Object.assign(
        Object.fromEntries(dateCols.map((i) => [i, { cellWidth: dateCols.length > 1 ? 82 : 72, textColor: MUTED }])),
        { [head.length - 1]: { textColor: accent, halign: "right" } }
      ),
      // In comparisons, bold the date of whoever liked it first.
      didParseCell: (d) => {
        if (d.section !== "body" || dateCols.length < 2 || !dateCols.includes(d.column.index)) return;
        const r = d.row.raw;
        const winner = r[4];
        const isA = d.column.index === dateCols[0];
        if (winner !== "tie" && ((isA && winner === head[2].replace(/ liked$/, "")) || (!isA && winner === head[3].replace(/ liked$/, "")))) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = TEXT;
        }
      },
      // New pages get the dark background before the table draws on them
      willDrawPage: (d) => { if (d.pageNumber > 1) paint(); },
      didDrawPage: () => {
        doc.setFont("DejaVu", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`page ${doc.internal.getNumberOfPages()}`, W - M, H - 20, { align: "right" });
      },
    });

    doc.save(filename.replace(/[^\w.-]+/g, "-"));
  };
})();
