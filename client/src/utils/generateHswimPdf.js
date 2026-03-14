import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Captures an array of DOM elements with html2canvas and stitches
 * them into a single A4-landscape PDF, one element per page.
 *
 * @param {Array<React.RefObject>} pageRefs   - ordered list of refs to capture
 * @param {string}                 filename   - output filename (without .pdf)
 * @param {function}               onProgress - optional (pct: number) => void
 */
export async function generateHswimPDF(pageRefs, filename = "hswim_report", onProgress) {
  // A4 landscape in mm
  const PAGE_W = 297;
  const PAGE_H = 210;

  const doc = new jsPDF({
    orientation: "landscape",
    unit:        "mm",
    format:      "a4",
  });

  const validRefs = pageRefs.filter(r => r?.current);
  let pageIndex = 0;

  for (const ref of validRefs) {
    const el = ref.current;

    // Temporarily force the element to its natural full width so
    // html2canvas captures everything without horizontal clipping
    const prevOverflow = el.style.overflow;
    el.style.overflow = "visible";

    const canvas = await html2canvas(el, {
      scale:           2.5,      // Higher scale for crisper text
      useCORS:         true,
      backgroundColor: "#ffffff",
      logging:         false,
      windowWidth:     1200,     // Consistent render width
      onclone: (_clonedDoc, clonedEl) => {
        // Ensure canvas charts are visible
        clonedEl.querySelectorAll("canvas").forEach(cv => {
          cv.style.display = "block";
        });
        // Remove box shadow from clone so it doesn't show in PDF
        clonedEl.style.boxShadow = "none";
      },
    });

    el.style.overflow = prevOverflow;

    const imgData   = canvas.toDataURL("image/jpeg", 0.98);
    const imgW      = canvas.width;
    const imgH      = canvas.height;
    // Fit to A4 landscape with 5mm margins on each side
    const margin    = 5;
    const maxW      = PAGE_W - margin * 2;
    const maxH      = PAGE_H - margin * 2;
    const ratio     = Math.min(maxW / imgW, maxH / imgH);
    const drawW     = imgW * ratio;
    const drawH     = imgH * ratio;
    // Centre on the page
    const offsetX   = (PAGE_W - drawW) / 2;
    const offsetY   = (PAGE_H - drawH) / 2;

    if (pageIndex > 0) doc.addPage();
    doc.addImage(imgData, "JPEG", offsetX, offsetY, drawW, drawH);

    pageIndex++;
    if (onProgress) onProgress(Math.round((pageIndex / validRefs.length) * 100));
  }

  doc.save(`${filename}.pdf`);
}