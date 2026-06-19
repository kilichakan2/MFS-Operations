/**
 * lib/adapters/jspdf/JsPdfRenderer.ts — the jsPDF adapter for the PdfRenderer port (F-22)
 *
 * The ONE place `jspdf` and `jspdf-autotable` may be imported (ESLint-enforced:
 * the static no-restricted-imports ban AND the dynamic no-restricted-syntax ban
 * both whitelist this folder only). The render routine moved here VERBATIM from
 * app/pricing/page.tsx — same PDF content, same coordinates, same colours, same
 * filename, same doc.save() download. The only edits are field-access renames
 * (snake_case agreement.* → camelCase data.*, per the port's PriceAgreementPdfData
 * shape) and a private copy of fmtDate (the adapter must not import from app/**).
 *
 * Lazy-load preserved: jsPDF + jspdf-autotable are pulled in via dynamic
 * `await import(...)` INSIDE the method, so they are NOT in the initial page
 * bundle — they load only when Export is clicked. Keep these dynamic; a static
 * top-level import would silently ship the heavy lib in the first paint (and is
 * banned by no-restricted-syntax everywhere outside this folder anyway).
 *
 * Browser-only: the routine touches window.Image / document.createElement and
 * triggers a download. It is only ever called from a 'use client' component on a
 * user click, so its body never runs during SSR; the factory does no I/O.
 */
import type {
  PdfRenderer,
  PriceAgreementPdfData,
} from "@/lib/ports";

/** Date formatter — a private copy of the page-level helper (app/pricing/page.tsx).
 *  Copied verbatim because adapters must not import from app/** (dependency arrow
 *  points inward); the page keeps its own copy for its other date labels. */
function fmtDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Convert a SVG data URI to a PNG data URI via the browser Canvas API.
 *  jsPDF addImage() does not support SVG — PNG is required. */
async function svgToPng(
  svgDataUri: string,
  pxW: number,
  pxH: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, pxW, pxH);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgDataUri;
  });
}

async function exportPdf(data: PriceAgreementPdfData) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const navy = [22, 32, 91] as [number, number, number];
  const orange = [235, 102, 25] as [number, number, number];
  const gray = [107, 114, 128] as [number, number, number];

  // ── Header bar ──
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 28, "F");

  // Orange accent stripe
  doc.setFillColor(...orange);
  doc.rect(0, 28, 210, 2, "F");

  // MFS logo — convert SVG to PNG via canvas (jsPDF addImage doesn't support SVG)
  // Logo aspect ratio: 912×238 ≈ 3.83:1 → at 52mm wide = ~13.6mm tall, 4× for crispness
  const logoDataUri =
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTEyIiBoZWlnaHQ9IjIzOCIgdmlld0JveD0iMCAwIDkxMiAyMzgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik04MDkuMzMyIDE2NS45NzNDNzU2LjgxOCAxNjUuOTczIDcyMy4wNDMgMTQ1LjEwOSA3MjEuNDE1IDExNC4zMTRDNzIxLjMyNiAxMTIuNjYgNzIyLjY4NyAxMTEuMzMgNzI0LjM0MyAxMTEuMzNINzUxLjg0M0M3NTMuNTMyIDExMS4zMyA3NTQuODY0IDExMi43MTkgNzU1LjExMyAxMTQuMzg5Qzc1Ny4yODQgMTI5LjIxIDc3Ni45NTEgMTM4Ljc2NSA4MDcuOTY5IDEzOC43NjVDODQ1LjM4MiAxMzguNzY1IDg2Ni4wMTcgMTMxLjk2MiA4NjYuMDE3IDExNi45OThDODY2LjAxNyA3NC4xNDM3IDcyNS42NjYgMTIzLjgwMSA3MjUuNjY2IDUwLjEwOTFDNzI1LjY2NiAxNy42ODU5IDc1OS45MDIgMC4wMDAxMjIwNyA4MDkuMTAyIDAuMDAwMTIyMDdDODU5LjE4OCAwLjAwMDEyMjA3IDg5Mi42NzIgMjAuNDMwNiA4OTQuOTIgNTEuNTk4NUM4OTUuMDM3IDUzLjI3MyA4OTMuNjY5IDU0LjY0MyA4OTEuOTkzIDU0LjY0M0g4NjUuMTg1Qzg2My41MTUgNTQuNjQzIDg2Mi4xODUgNTMuMjggODYxLjkzOSA1MS42MjY2Qzg1OS42NjggMzYuNTcwOCA4NDAuMjM1IDI2Ljk4MDggODEwLjAwOCAyNi45ODA4Qzc3Ny4xMzYgMjYuOTgwOCA3NTguMzE0IDMzLjc4MzkgNzU4LjMxNCA0Ny4zODc5Qzc1OC4zMTQgODcuMjkzMyA4OTguNDQgNDEuMDM5IDg5OC40NCAxMTUuNjM1Qzg5OC40NCAxNDguNzM5IDg2My4yOTEgMTY1Ljk3MSA4MDkuMzI5IDE2NS45NzFMODA5LjMzMiAxNjUuOTczWiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNNTYyLjMxNiAxNjIuMzUyQzU2MC42NDYgMTYyLjM1MiA1NTkuMjg4IDE2MC45OTggNTU5LjI4OCAxNTkuMzI2VjYuNjYxNjhDNTU5LjI4OCA0Ljk4OTU5IDU2MC42NDQgMy42MzU5OSA1NjIuMzE2IDMuNjM1OTlINzAxLjgzMUM3MDMuNSAzLjYzNTk5IDcwNC44NTIgNC45OTE5MyA3MDQuODUyIDYuNjYxNjhWMjcuNTkxQzcwNC44NTIgMjkuMjYzMSA3MDMuNSAzMC42MTY3IDcwMS44MzEgMzAuNjE2N0g1OTQuNTFDNTkyLjg0IDMwLjYxNjcgNTkxLjQ4OSAzMS45NzI2IDU5MS40ODkgMzMuNjQyNFY2My40MTQ2QzU5MS40ODkgNjUuMDg2NiA1OTIuODQgNjYuNDQwMyA1OTQuNTEgNjYuNDQwM0g2OTAuNzE4QzY5Mi4zODggNjYuNDQwMyA2OTMuNzQ2IDY3Ljc5NjIgNjkzLjc0NiA2OS40NjU5Vjg4LjM1MzFDNjkzLjc0NiA5MC4wMjUyIDY5Mi4zOTEgOTEuMzc4OCA2OTAuNzE4IDkxLjM3ODhINTk0LjUxQzU5Mi44NCA5MS4zNzg4IDU5MS40ODkgOTIuNzMyNCA1OTEuNDg5IDk0LjQwNDVWMTU5LjMyMUM1OTEuNDg5IDE2MC45OTMgNTkwLjEzMyAxNjIuMzQ3IDU4OC40NjEgMTYyLjM0N0g1NjIuMzE2VjE2Mi4zNTJaIiBmaWxsPSIjRUI2NjE5Ii8+CjxwYXRoIGQ9Ik00MDUuODA2IDMuNjM1OTlDNDA3LjQ3OCAzLjYzNTk5IDQwOC44MzEgNC45ODk1OSA0MDguODMxIDYuNjYxNjhWMTE2LjIyNEw0MzIuMDYgODIuOTk0OUw0ODYuNjQgNC45Mjg3QzQ4Ny4yMDcgNC4xMTg0MSA0ODguMTMyIDMuNjM1OTkgNDg5LjEyIDMuNjM1OTlINTE3LjYyMUM1MTkuMjkzIDMuNjM1OTkgNTIwLjY0NiA0Ljk4OTU5IDUyMC42NDYgNi42NjE2OFYxNTkuMzI2QzUyMC42NDYgMTYwLjk5OCA1MTkuMjkzIDE2Mi4zNTQgNTE3LjYyMSAxNjIuMzU0SDQ5MS40NzZDNDg5LjgwNCAxNjIuMzU0IDQ4OC40NSAxNjAuOTk4IDQ4OC40NSAxNTkuMzI2VjY0LjAxNDFDNDg4LjQ1IDYxLjEwMDggNDg0LjczNiA1OS44NjkgNDgyLjk5NiA2Mi4yMDg1TDQwOS4zODQgMTYxLjEyNEM0MDguODEgMTYxLjg5NSA0MDcuOTA0IDE2Mi4zNDkgNDA2Ljk0MSAxNjIuMzQ0TDQwNi4wNjYgMTYyLjM0QzQwNS45NzkgMTYyLjM0NyA0MDUuODkyIDE2Mi4zNTQgNDA1LjgwNiAxNjIuMzU0SDM3OS42NjFDMzc3Ljk4OSAxNjIuMzU0IDM3Ni42MzUgMTYwLjk5OCAzNzYuNjM1IDE1OS4zMjZWNjQuMDE0MUMzNzYuNjM1IDYxLjEwMDggMzcyLjkyMSA1OS44NjkgMzcxLjE4MSA2Mi4yMDg1TDI5Ny41NjQgMTYxLjEzNEMyOTYuOTkzIDE2MS45MDIgMjk2LjA5NCAxNjIuMzU0IDI5NS4xMzYgMTYyLjM1NEgyNzAuNTc0QzI2OC4xMjcgMTYyLjM1NCAyNjYuNjkyIDE1OS41OTcgMjY4LjA5NCAxNTcuNTkxTDM3NC44MjUgNC45Mjg3QzM3NS4zOTIgNC4xMTg0MSAzNzYuMzE3IDMuNjM1OTkgMzc3LjMwNSAzLjYzNTk5SDQwNS44MDZaIiBmaWxsPSIjRUI2NjE5Ii8+CjxwYXRoIGQ9Ik0xMTUuNDA1IDEyNy45MTNDMTE1LjE5OSAxMjcuNDE1IDExMy40NzMgMTIzLjMyMyAxMTAuMTMzIDEyMC4wMDNDMTAzLjcxOSAxMTMuNjIxIDk1Ljk2NTEgMTEzLjA2NiA5NC4xNjg5IDExMi45ODRDNjMuNzgwOCAxMTIuOTcgMzMuMzkyNyAxMTIuOTU2IDMuMDA0NjIgMTEyLjk0MkMxLjM0NjU3IDExMi45NDIgMCAxMTQuMjg2IDAgMTE1Ljk0N1YxMzIuOTExQzAgMTM0LjU3MSAxLjM0NDIzIDEzNS45MTYgMy4wMDQ2MiAxMzUuOTE2SDY0LjA2ODlWMTM1Ljk2OUM2Ny4yNTM4IDEzNS45NjkgNjkuODI5OSAxMzguNTQ2IDY5LjgyOTkgMTQxLjczQzY5LjgyOTkgMTQzLjM3IDY5LjE1MDcgMTQ0Ljg0NSA2OC4wNSAxNDUuODk5SDY4LjA4MDVMMjIuNTU0NSAxOTEuNDI1QzIxLjM4MTMgMTkyLjU5OCAyMS4zODEzIDE5NC41IDIyLjU1NDUgMTk1LjY3M0wzNC41NDk2IDIwNy42NjhDMzUuNzIyOSAyMDguODQxIDM3LjYyNDUgMjA4Ljg0MSAzOC43OTc3IDIwNy42NjhMODUuMzc5OSAxNjEuMDg2Qzg2LjI0ODcgMTYwLjU2MSA4Ny4yNTEgMTYwLjI0MSA4OC4zNDIzIDE2MC4yNDFDOTEuNTI3MyAxNjAuMjQxIDk0LjEwMzMgMTYyLjgxNyA5NC4xMDMzIDE2Ni4wMDJIOTQuMjUwOVYyMjcuMDYxQzk0LjI1MDkgMjI4LjcxOSA5NS41OTUxIDIzMC4wNjYgOTcuMjU1NSAyMzAuMDY2SDExNC4yMkMxMTUuODggMjMwLjA2NiAxMTcuMjI1IDIyOC43MjIgMTE3LjIyNSAyMjcuMDYxTDExNy4yNDEgMTM1Ljk2NUMxMTcuMjQxIDEzNC45MTMgMTE2Ljk3OSAxMzEuNzAzIDExNS40MDcgMTI3LjkxMUwxMTUuNDA1IDEyNy45MTNaIiBmaWxsPSIjRUI2NjE5Ii8+CjxwYXRoIGQ9Ik0yMjEuOTc3IDEyNC40M0MyMjEuOTc3IDEyNC40MTIgMjIxLjYyOSAxMjQuMzk4IDIyMS4yNDIgMTI0LjM4NkMyMjEuMTkxIDEyNC4zOTUgMjIxLjEzMiAxMjQuNDAyIDIyMS4xMzQgMTI0LjQxNEMyMjEuMTQxIDEyNC40ODIgMjIxLjk3NyAxMjQuNDU4IDIyMS45NzcgMTI0LjQzWiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNMjI2LjMyNCAxMjAuNDAyQzIyNi4zMDYgMTE4LjQ0MiAyMjYuMjggMTE2LjQ4OSAyMjYuMjk0IDExNC41MjlDMjI2LjMwMSAxMTMuMjU1IDIyNi4zMDEgMTExLjUzOCAyMjYuMjc4IDEwOS4wNjVWMTA0LjM4NkMyMjYuMjc4IDEwNC4zNTYgMjI2LjI2MSAxMDQuMzMgMjI2LjI2MSAxMDQuMjZDMjI2LjI1NCAxMDQuMTc4IDIyNi4yMTQgMTAzLjkxOCAyMjYuMTIxIDEwMy42MDRDMjI2LjAzNCAxMDMuMjkzIDIyNS45MDUgMTAzLjAxNiAyMjUuNjk3IDEwMi43MDNDMjI1LjUyOCAxMDIuNDYxIDIyNS4zNDMgMTAyLjI1MSAyMjUuMTAyIDEwMi4wNTZDMjI1LjA4MyAxMDIuMDQgMjI1LjA2MiAxMDIuMDM1IDIyNS4wNDMgMTAyLjAyMUMyMjQuNzg4IDEwMS44MjkgMjI0LjUxOSAxMDEuNjcyIDIyNC4yMDcgMTAxLjU2OUMyMjMuNTUyIDEwMS4zMzUgMjIyLjk3OCAxMDEuMzYxIDIyMi44MjYgMTAxLjM3NUMyMjIuNjk1IDEwMS4zNzUgMjIyLjU2MyAxMDEuMzc5IDIyMi40MyAxMDEuMzgySDE2Mi44MjlDMTYxLjY1OCAxMDEuMzkzIDE2MC40OSAxMDEuNDA1IDE1OS4zMTkgMTAxLjQxN0MxNTMuOTgyIDEwMS40MTcgMTUxLjMwNyA5NC45NjI3IDE1NS4wODIgOTEuMTg3NkMxNTUuODA0IDkwLjQ2NjMgMTU2LjUzNyA4OS43MzEgMTU3LjI3OSA4OC45ODYyQzE3MS42MjMgNzQuNjY1NyAxODUuOTY1IDYwLjM0NzUgMjAwLjMwOSA0Ni4wMjdDMjAxLjMxNiA0NS4wMiAyMDEuNDA1IDQzLjUwMjUgMjAwLjY4MyA0Mi4zNDMyQzIwMC41OTIgNDIuMTYyOSAyMDAuNDk4IDQxLjk4OTYgMjAwLjQxNiA0MS44NzQ5QzE5OS40NTkgNDAuOTA3NyAxOTguNjc5IDQwLjEyNTUgMTk4LjE3NSAzOS42MTczQzE5Ni4wNiAzNy40OTA5IDE5My41NTUgMzQuOTY2MyAxOTAuNDQgMzEuODc5OEMxODkuODI0IDMxLjI3MDkgMTg5LjIwOCAzMC42NTk2IDE4OC41OTIgMzAuMDUwOEMxODguNTM0IDI5Ljk3NTggMTg4LjA3MiAyOS40NDY2IDE4Ny4zMTYgMjkuMTIxQzE4Ni45NjkgMjguOTc1OCAxODYuNTgzIDI4Ljg2MzQgMTg2LjExIDI4Ljg4MjJDMTg1LjczNSAyOC44OTYyIDE4NS40MTQgMjguOTg5OSAxODUuMTI5IDI5LjEwN0MxODUuMDM1IDI5LjE0MjEgMTg0Ljk1NSAyOS4yMDMgMTg0Ljg2NCAyOS4yNDk4QzE4NC42MzIgMjkuMzc2MyAxODQuNDQgMjkuNTAwNCAxODQuMjkgMjkuNjMxNkMxODQuMjE4IDI5LjY5MDEgMTg0LjEzMSAyOS43MTU5IDE4NC4wNjMgMjkuNzgxNEwxODIuMDQyIDMxLjgwMjVDMTgyLjAxNiAzMS44MjgyIDE4MS45OSAzMS44NTE3IDE4MS45NjUgMzEuODc3NEMxNjcuNiA0Ni4yNDI0IDE1My4yMzcgNjAuNjA3NSAxMzguODcyIDc0Ljk3MjVDMTM2LjgxMSA3Ny4wMzMzIDEzMy43NTUgNzcuMDMxIDEzMS43NDggNzUuOTg4OUMxMjkuNTQ0IDc0Ljg0MzcgMTI4Ljg3IDcyLjAzODEgMTI4LjY0MyA3MC43MzYxQzEyOC42NDUgNjkuNzEwMyAxMjguNjQ1IDY4LjY3OTkgMTI4LjY1OSA2Ny42NTQyVjU4LjgxMzZDMTI4LjY2NCA1NC44NzIyIDEyOC42NzMgNTAuOTM1NiAxMjguNjc1IDQ2Ljk4NzJDMTI4LjY4IDM5LjIzMDkgMTI4LjY2NiAzMS41MDI3IDEyOC42NTkgMjMuNzY3NVY2Ljg1NDU0QzEyOC42NTkgNi43ODY2MyAxMjguNjI0IDYuNzMwNDIgMTI4LjYxOSA2LjY2MjUxQzEyOC41OTggNi40NjM0NSAxMjguNTYxIDYuMjMzOTUgMTI4LjQ4MSA1Ljk3NjM0QzEyOC4xMzkgNC44ODI2OSAxMjcuMjE3IDQuMDkzNDggMTI2LjA1NSAzLjkzMTg5QzEyNS45OTkgMy45MjAxOCAxMjUuOTQ1IDMuOTA2MTMgMTI1Ljg4NiAzLjg5OTFDMTI1LjgwNCAzLjg5MjA4IDEyNS43MzYgMy44NTIyNiAxMjUuNjUyIDMuODUyMjZIMTI1LjM0M0MxMjUuMjg5IDMuODQ5OTIgMTI1LjIzOCAzLjgzODIxIDEyNS4xODEgMy44MzgyMUMxMjQuNjc2IDMuODI4ODUgMTIzLjc3MiAzLjgxNzE0IDEyMi42NDUgMy44MDc3N0MxMTguOTkgMy43NzczMiAxMTcuMDQ4IDMuODI2NSAxMTIuNTg5IDMuODM4MjFDMTExLjc3NCAzLjgzODIxIDExMC40NjMgMy44NDI5IDEwOC44MjYgMy44MzgyMUMxMDguNzkzIDMuODM4MjEgMTA4Ljc3IDMuODUyMjYgMTA4LjY4NSAzLjg1MjI2QzEwOC42MTUgMy44NTIyNiAxMDguNTU0IDMuODg3MzkgMTA4LjQ4NCAzLjg5MjA4QzEwOC4xNTQgMy45MjAxOCAxMDcuODM4IDMuOTY0NjcgMTA3LjU1NCA0LjA3OTQzQzEwNy40NDkgNC4xMjE1OCAxMDcuMzY5IDQuMTk4ODYgMTA3LjI3MSA0LjI1MjcyQzEwNy4wNDQgNC4zNzkxOCAxMDYuODE5IDQuNTAwOTYgMTA2LjYzNiA0LjY4MTI5QzEwNi40MyA0Ljg3NTY2IDEwNi4yOCA1LjExNjg3IDEwNi4xMzUgNS4zNjI3N0MxMDYuMTAyIDUuNDIzNjYgMTA2LjA1MyA1LjQ2ODE1IDEwNi4wMjMgNS41MjkwNEMxMDUuODYzIDUuODQ5ODggMTA1Ljc3NCA2LjE5ODgyIDEwNS43MzkgNi41NzExN0MxMDUuNzM1IDYuNjAzOTYgMTA1LjcxOCA2LjYyOTcyIDEwNS43MTMgNi42OTc2NEMxMDUuNzExIDYuNzUxNSAxMDUuNjgzIDYuNzk4MzQgMTA1LjY4MyA2Ljg1MjJWNy45MzY0OEMxMDUuNjgzIDguMTQwMjMgMTA1LjY3NiA4LjM0MTYzIDEwNS42ODMgOC41NDUzN0MxMDUuNjgzIDguNTQ1MzcgMTA1LjY4MyA2Ny4yOTM1IDEwNS43MTEgNjcuMjkzNVY3MC43Mzg0QzEwNS43MTEgNzYuMDc1NSA5OS4yNTQ2IDc4Ljc0OTkgOTUuNDc5NSA3NC45NzQ4QzgxLjExNDUgNjAuNjA5OCA2Ni43NTE4IDQ2LjI0NDggNTIuMzg2NyAzMS44Nzk4QzUyLjA3NzYgMzEuNjEwNCA1MS43Njg1IDMxLjM0MTEgNTEuNDU5NCAzMS4wNzE4TDUwLjI2NSAyOS44Nzc1QzQ5LjMzMjkgMjguOTQ1NCA0Ny45NTgzIDI4Ljc4NjIgNDYuODM2NSAyOS4zMzE4QzQ2LjMyODMgMjkuNTQ3MyA0NS45ODE3IDI5LjgyODMgNDUuODg4IDI5LjkxNzNDNDUuMjMgMzAuNTczIDQ0LjU2OTYgMzEuMjI2NCA0My45MTE1IDMxLjg4MjFDNDMuMjk3OSAzMi40OTEgNDIuMjc5MiAzMy41OTY0IDQwLjU3NjcgMzUuMzJMMzkuMTc2MyAzNi43MjA0QzM4LjMxNjggMzcuNTcwNSAzNy4zMjM4IDM4LjUzMyAzNi4xNzYzIDM5LjYyMkMzNS4zNzU0IDQwLjM4MDcgMzQuNzI5IDQwLjk3NTYgMzQuMzk2NSA0MS4yOEMzNC4xMTc4IDQxLjU3NTEgMzMuNzczNiA0Mi4wMzQxIDMzLjUzOTQgNDIuNjAzMkMzMi45MzA1IDQzLjczOSAzMy4wNjQgNDUuMTY1MiAzNC4wMjE4IDQ2LjEyNTRDMzQuMDIxOCA0Ni4xMjU0IDM1LjI1ODMgNDcuMzYxOSAzNS4yNzQ3IDQ3LjM4MjlDMzYuMTE1NCA0OC4zNjQyIDM2Ljg5MjkgNDkuMDU5NyAzNy4zNDk2IDQ5LjQ1MzFMNDIuNzc1NyA1NC44NzkzQzQyLjk5MzUgNTUuMDk5NCA0My4yMDkgNTUuMzE5NSA0My40MjY3IDU1LjUzNzNDNDkuMTUyNiA2MS4yNjMyIDU0Ljg3NjEgNjYuOTg2NyA2MC42MDIgNzIuNzEyNkM2Ni4zMjc5IDc4LjQzODUgNzIuMDUxNCA4NC4xNjIgNzcuNzc3MyA4OS44ODc5SDExNy4yMzVDMTE5LjE3MiA5MC4wMDI2IDEyNi41NDcgOTAuNjc0NyAxMzIuNzc4IDk2LjcwMjdDMTM5LjQ1IDEwMy4xNTcgMTQwLjA4IDExMS4xNzggMTQwLjE3NiAxMTIuOTgzVjE1Mi4yODlMMTgxLjg0OCAxOTMuOTYxQzE4Mi4yOTUgMTk0LjM5MSAxODIuNjQ0IDE5NC43NSAxODIuODgzIDE5NC45OTZDMTgzLjE5NCAxOTUuMzE2IDE4My40MDMgMTk1LjU0NiAxODMuNzYxIDE5NS44NzRDMTg0LjA4NiAxOTYuMTc0IDE4NC4yNSAxOTYuMzI0IDE4NC40NCAxOTYuNDVDMTg0LjQ0IDE5Ni40NSAxODQuNjIgMTk2LjU2NyAxODQuOTExIDE5Ni42OTFDMTg1LjAyMSAxOTYuNzQzIDE4NS4xMzEgMTk2Ljc3MSAxODUuMjQ2IDE5Ni44MDhDMTg1LjQ2MyAxOTYuODc2IDE4NS43IDE5Ni45MzUgMTg1Ljk4NiAxOTYuOTUxQzE4Ni4xMzYgMTk2Ljk2IDE4Ni4yNzYgMTk2Ljk0NCAxODYuNDI2IDE5Ni45M0MxODYuNTYyIDE5Ni45MTQgMTg2LjY4OCAxOTYuODg4IDE4Ni44MTUgMTk2Ljg1NUMxODcuMzQ5IDE5Ni43MzMgMTg3Ljg2MiAxOTYuNTE4IDE4OC4yNzggMTk2LjEwM0wyMDAuMjczIDE4NC4xMDhDMjAxLjQ0NyAxODIuOTM1IDIwMS40NDcgMTgxLjAzMyAyMDAuMjczIDE3OS44NkMyMDAuMjczIDE3OS44NiAxOTkuNjk3IDE3OS4yODQgMTk5LjY3NCAxNzkuMjU0QzE5OS40NjEgMTc4Ljk5NiAxOTkuMDU4IDE3OC41NyAxOTguNjIgMTc4LjE0OEMxOTguNDgyIDE3OC4wMTUgMTk4LjMzNyAxNzcuODgxIDE5OC4xNjggMTc3LjczNEMxOTcuOTA4IDE3Ny41MDQgMTk3LjY3NCAxNzcuMjQ3IDE5Ny40MjMgMTc3LjAxTDE5My44NzEgMTczLjQ1N0MxOTMuNjMgMTczLjIwOSAxOTMuMzkzIDE3Mi45NTYgMTkzLjE0NyAxNzIuNzFDMTkxLjg0NSAxNzEuNDIgMTkwLjY1MSAxNzAuMjMzIDE4OS41MjkgMTY5LjExM0wxODMuMTAzIDE2Mi42ODdDMTc0Ljk1MSAxNTQuNDk1IDE3NC4yMTggMTUzLjU3NSAxNzIuMDMzIDE1MS42MTdDMTcxLjM1NCAxNTAuOTM4IDE3MC42NzIgMTUwLjI1NyAxNjkuOTkzIDE0OS41NzdDMTY4LjQ2MiAxNDguMDQ2IDE2Ni45MyAxNDYuNTE0IDE2NS4zOTggMTQ0Ljk4M0MxNjMuOTA0IDE0My40ODkgMTYzLjQ4NSAxNDMuMDU4IDE2Mi4yMjcgMTQxLjgwNUMxNjEuMDcxIDE0MC42NSAxNjEuMTc0IDE0MC43NiAxNjAuNTMgMTQwLjExNEMxNTguMTkgMTM3Ljc2NSAxNTguMjM3IDEzNy43MyAxNTcuMzQ1IDEzNi45MDhDMTU3LjA5MiAxMzYuNjc0IDE1Ni42MjYgMTM2LjI1IDE1Ni4wMjIgMTM1LjYxOEMxNTUuNTIzIDEzNS4wOTUgMTU1LjE1IDEzNC42NDggMTU1LjA3OCAxMzQuNTc1QzE1MS4zMDMgMTMwLjggMTUzLjk3NyAxMjQuMzQ2IDE1OS4zMTQgMTI0LjM0NkMxNjAuMzEyIDEyNC4zNDYgMTYxLjM3MyAxMjQuMzQ2IDE2Mi40NjQgMTI0LjM0NEMxODEuNzc3IDEyNC4zNDggMjAxLjA5MSAxMjQuMzUzIDIyMC40MDQgMTI0LjM1NUMyMjAuNjA2IDEyNC4zNjUgMjIwLjkzMyAxMjQuMzc0IDIyMS4yNCAxMjQuMzg2QzIyMS4yOTYgMTI0LjM3NyAyMjEuMzc4IDEyNC4zNjUgMjIxLjQ4NiAxMjQuMzU1SDIyMy4yNjZDMjI0LjU0NSAxMjQuMzU1IDIyNS42MiAxMjMuNTUyIDIyNi4wNTMgMTIyLjQyOEMyMjYuMzAxIDEyMS45MzQgMjI2LjMyOSAxMjEuMzg0IDIyNi4zMTcgMTIwLjQwMkgyMjYuMzI0WiIgZmlsbD0iI0VCNjYxOSIvPgo8cGF0aCBkPSJNMjc1LjcyOCAyMjkuNzMzTDI2NS43OTUgMjAyLjg4OUgyNzEuNzAxTDI3OC44MzQgMjIyLjY3N0wyODUuNTgzIDIwMi44ODlIMjkwLjkxM0wyOTcuNjI0IDIyMi42NzdMMzA0Ljc5NSAyMDIuODg5SDMxMC43MDFMMzAwLjc2OSAyMjkuNzMzSDI5NC42MzNMMjg4LjI2NyAyMTAuODI3TDI4MS44MjUgMjI5LjczM0gyNzUuNzI4Wk0zNTUuNDQ0IDIyOS43MzNWMjAyLjg4OUgzNjAuODg5VjIxMy4xNjdIMzc4Ljk1MVYyMDIuODg5SDM4NC4zOTZWMjI5LjczM0gzNzguOTUxVjIxNy43NjhIMzYwLjg4OVYyMjkuNzMzSDM1NS40NDRaTTQ0Ni42MzIgMjMwLjM0NkM0MzYuODkxIDIzMC4zNDYgNDMwLjQ0OSAyMjQuNzQ4IDQzMC40NDkgMjE2LjMxMUM0MzAuNDQ5IDIwNy44NzUgNDM2Ljg5MSAyMDIuMjc2IDQ0Ni42MzIgMjAyLjI3NkM0NTYuMzMzIDIwMi4yNzYgNDYyLjgxNCAyMDcuODc1IDQ2Mi44MTQgMjE2LjMxMUM0NjIuODE0IDIyNC43NDggNDU2LjMzMyAyMzAuMzQ2IDQ0Ni42MzIgMjMwLjM0NlpNNDQ2LjYzMiAyMjUuNzQ1QzQ1My4wNzQgMjI1Ljc0NSA0NTcuMzY5IDIyMi4xNCA0NTcuMzY5IDIxNi4zMTFDNDU3LjM2OSAyMTAuNDgyIDQ1My4wNzQgMjA2LjgzOSA0NDYuNjMyIDIwNi44MzlDNDQwLjE4OSAyMDYuODM5IDQzNS44OTQgMjEwLjQ4MiA0MzUuODk0IDIxNi4zMTFDNDM1Ljg5NCAyMjIuMTQgNDQwLjE4OSAyMjUuNzQ1IDQ0Ni42MzIgMjI1Ljc0NVpNNTA4LjkwMyAyMjkuNzMzVjIwMi44ODlINTE0LjM0OVYyMjUuMTMxSDUzMy4wNjJWMjI5LjczM0g1MDguOTAzWk01NzcuMzU3IDIyOS43MzNWMjAyLjg4OUg2MDMuMjQyVjIwNy40NTNINTgyLjgwMlYyMTMuMzJINjAwLjk3OVYyMTcuNTM4SDU4Mi44MDJWMjI1LjEzMUg2MDMuMjQyVjIyOS43MzNINTc3LjM1N1pNNjYzLjI3MSAyMzAuMzQ2QzY1NC4xMDYgMjMwLjM0NiA2NDguMzE2IDIyNi41ODggNjQ4LjM5MiAyMjEuMTA1SDY1NC4wNjhDNjU0LjAzIDIyMy45MDQgNjU3LjQ0MyAyMjUuNzQ1IDY2My4wNDEgMjI1Ljc0NUM2NjkuMzY5IDIyNS43NDUgNjcyLjg1OCAyMjQuNTk0IDY3Mi44NTggMjIyLjA2M0M2NzIuODU4IDIxNC44MTYgNjQ5LjEyMSAyMjMuMjE0IDY0OS4xMjEgMjEwLjc1MUM2NDkuMTIxIDIwNS4yNjcgNjU0LjkxMiAyMDIuMjc2IDY2My4yMzMgMjAyLjI3NkM2NzEuOTc2IDIwMi4yNzYgNjc3LjcyOCAyMDUuOTU3IDY3Ny43NjcgMjExLjUxOEg2NzIuMjA2QzY3Mi4yMDYgMjA4LjY4IDY2OC44MzIgMjA2LjgzOSA2NjMuMzg2IDIwNi44MzlDNjU3LjgyNiAyMDYuODM5IDY1NC42NDMgMjA3Ljk5IDY1NC42NDMgMjEwLjI5MUM2NTQuNjQzIDIxNy4wNCA2NzguMzQyIDIwOS4yMTcgNjc4LjM0MiAyMjEuODMzQzY3OC4zNDIgMjI3LjQzMiA2NzIuMzk4IDIzMC4zNDYgNjYzLjI3MSAyMzAuMzQ2Wk03MjAuNjkzIDIyOS43MzNMNzM3LjAzIDIwMi44ODlINzQzLjYyNUw3NjAgMjI5LjczM0g3NTMuNzExTDc1MC4zNzUgMjI0LjA1N0g3MzAuMjhMNzI2Ljk4MiAyMjkuNzMzSDcyMC42OTNaTTczMi45MjYgMjE5LjQ1Nkg3NDcuNzI5TDc0MC4zNjYgMjA2LjY4Nkw3MzIuOTI2IDIxOS40NTZaTTgwMy45ODkgMjI5LjczM1YyMDIuODg5SDgwOS40MzRWMjI1LjEzMUg4MjguMTQ4VjIyOS43MzNIODAzLjk4OVpNODcyLjQ0MiAyMjkuNzMzVjIwMi44ODlIODk4LjMyN1YyMDcuNDUzSDg3Ny44ODhWMjEzLjMySDg5Ni4wNjVWMjE3LjUzOEg4NzcuODg4VjIyNS4xMzFIODk4LjMyN1YyMjkuNzMzSDg3Mi40NDJaIiBmaWxsPSIjRUI2NjE5Ii8+Cjwvc3ZnPgo=";
  const logoPng = await svgToPng(logoDataUri, 912, 238);
  doc.addImage(logoPng, "PNG", 12, 7.2, 52, 13.6);

  // Section label on right
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text("Contract Price Agreement", 210 - 14, 17, { align: "right" });

  // ── Compact 2-column meta block ──
  // Left: customer name + rep  |  Right: reference, valid dates, issued
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const metaTop = 35;
  const metaH = 27; // block height in mm

  // Light background card
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, metaTop, 182, metaH, 2, 2, "FD");

  // ── Left column: customer ──────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...gray);
  doc.text("CUSTOMER", 19, metaTop + 6.5);

  // Customer name — truncate if needed to fit column width (~88mm)
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  const custLines = doc.splitTextToSize(data.customerName, 84);
  doc.text(custLines[0], 19, metaTop + 12.5);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...gray);
  doc.text(`Agreed by ${data.repName}`, 19, metaTop + 19.5);
  if (data.isProspect) {
    doc.setFontSize(7.5);
    doc.setTextColor(217, 119, 6);
    doc.text("Prospect", 19, metaTop + 24.5);
  }

  // ── Vertical divider ──────────────────────────────────────────────────────
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(108, metaTop + 4, 108, metaTop + metaH - 4);

  // ── Right column: reference + dates ──────────────────────────────────────
  const rx = 113; // right column x
  const rVals: [string, string][] = [
    ["Ref", data.referenceNumber],
    [
      "Valid",
      data.validUntil
        ? `${fmtDate(data.validFrom)} – ${fmtDate(data.validUntil)}`
        : `${fmtDate(data.validFrom)} (ongoing)`,
    ],
    ["Issued", today],
  ];

  let ry = metaTop + 6.5;
  for (const [lbl, val] of rVals) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text(lbl, rx, ry);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(val, rx + 18, ry);
    ry += 7;
  }

  let y = metaTop + metaH + 5;

  // ── Notes (if any) ────────────────────────────────────────────────────────
  if (data.notes) {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, 182, 1, 0, 0, "F"); // top border accent
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(30, 58, 138);
    const noteLines = doc.splitTextToSize(`Note: ${data.notes}`, 176);
    // Light blue background sized to content
    const noteH = noteLines.length * 4.5 + 6;
    doc.setFillColor(239, 246, 255);
    doc.rect(14, y, 182, noteH, "F");
    doc.text(noteLines, 18, y + 5);
    y += noteH + 4;
  }

  // ── Divider before table ──────────────────────────────────────────────────
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.4);
  doc.line(14, y, 196, y);
  y += 5;

  // ── Products table ──
  autoTable(doc, {
    startY: y,
    head: [["Product", "Pack Size", "Price", "Unit", "Notes"]],
    body: data.lines.map((l) => [
      l.productName + (l.isFreetext ? " *" : ""),
      l.boxSize ?? "—",
      `£${(l.price as number).toFixed(2)}`,
      l.unit === "per_kg" ? "per kg" : "per box",
      l.notes ?? "",
    ]),
    headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 45 },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 22 },
      4: { cellWidth: "auto" },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Freetext footnote ──
  const hasFreetext = data.lines.some((l) => l.isFreetext);
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  if (hasFreetext) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...gray);
    doc.text("* Custom product — not in standard catalogue", 14, finalY);
  }

  // ── Footer ──
  const footerY = 280;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(14, footerY - 4, 196, footerY - 4);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...gray);
  doc.text("MFS Global Ltd  ·  mfsglobal.co.uk", 14, footerY);
  doc.text(
    "Prices are subject to change on notice. Whilst MFS Global Ltd will do its utmost to honour agreed pricing, we reserve the right to adjust prices in circumstances beyond our reasonable control, including supplier cost increases, market fluctuations, or significant changes in input costs. We will always endeavour to communicate any changes promptly and work with you to minimise disruption.",
    14,
    footerY + 4,
    { maxWidth: 182 },
  );

  const filename = `MFS-Pricing-${data.referenceNumber}-${data.customerName.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
  doc.save(filename);
}

/**
 * Build the jsPDF-backed PdfRenderer. The factory does no I/O and touches no
 * browser global — jsPDF loads lazily only when renderPriceAgreement runs.
 */
export function createJsPdfRenderer(): PdfRenderer {
  return {
    async renderPriceAgreement(data: PriceAgreementPdfData): Promise<void> {
      await exportPdf(data);
    },
  };
}
