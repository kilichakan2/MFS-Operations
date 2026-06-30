package com.mfsglobal.ops;

import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;

import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterException;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.SunmiPrinterService;
import com.sunmi.peripheral.printer.WoyouConsts;

import org.json.JSONObject;

public class SunmiPrintBridge {
    private static final String TAG = "MFSSunmiPrint";
    private final Context context;
    private SunmiPrinterService printerService;

    private final InnerPrinterCallback innerCallback = new InnerPrinterCallback() {
        @Override
        protected void onConnected(SunmiPrinterService service) {
            printerService = service;
            Log.d(TAG, "Sunmi printer service connected");
        }

        @Override
        protected void onDisconnected() {
            printerService = null;
            Log.d(TAG, "Sunmi printer service disconnected");
        }
    };

    public SunmiPrintBridge(Context context) {
        this.context = context;
        try {
            InnerPrinterManager.getInstance().bindService(context, innerCallback);
        } catch (InnerPrinterException e) {
            Log.e(TAG, "bindService failed: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public boolean isReady() {
        return printerService != null;
    }

    /**
     * Version-tolerant JSON entry point (ADR-0013). The new web build calls this
     * with a single JSON string read BY NAME — so adding/removing a field changes
     * JSON keys only, never this method's signature. An APK↔web version skew then
     * degrades gracefully (missing keys default to "", unknown keys ignored)
     * instead of the silent no-print a positional count mismatch caused.
     *
     * Keys mirror buildDeliveryPayload in lib/adapters/sunmi/Printer.ts.
     */
    @JavascriptInterface
    public void printLabel(String json) {
        if (printerService == null) {
            Log.w(TAG, "printLabel called but service not bound");
            return;
        }
        try {
            JSONObject o = new JSONObject(json);
            // "type" selects the layout; default to delivery (forward-compat for a
            // future "mince" layout). Read but currently always renders delivery.
            // Unknown keys are ignored — we only read the keys we know, each with
            // an "" default.
            o.optString("type", "delivery");
            renderDeliveryLabel(
                    o.optString("batch", ""),
                    o.optString("supplier", ""),
                    o.optString("date", ""),
                    o.optString("temp", ""),
                    o.optString("bornIn", ""),
                    o.optString("rearedIn", ""),
                    o.optString("slaughterSite", ""),
                    o.optString("cutSite", ""),
                    o.optString("species", ""),
                    o.optString("allergens", "")
            );
        } catch (Exception e) {
            Log.e(TAG, "printLabel error: " + e.getMessage(), e);
        }
    }

    /**
     * Legacy positional entry point. The currently-deployed web (old 9-arg shape)
     * still calls this, so it is kept as a safety net during switchover. It maps
     * the old single combined bornLine into the bornIn slot (rearedIn = "") and
     * delegates to the SAME shared renderer, so both entry points produce an
     * identical label (no layout drift).
     */
    @JavascriptInterface
    public void printDeliveryLabel(
            String batchCode,
            String supplierCode,
            String date,
            String tempLine,
            String bornLine,
            String slaughterSite,
            String cutSite,
            String species,
            String allergens
    ) {
        renderDeliveryLabel(
                batchCode, supplierCode, date, tempLine,
                bornLine, "", slaughterSite, cutSite, species, allergens);
    }

    /**
     * Shared label renderer — the single source of the label-mode sequence
     * (printerInit → labelLocate → content → labelOutput) and the reduced
     * 52×38mm layout (ADR-0012). Both printLabel and the legacy positional
     * printDeliveryLabel route here so the rendered label never drifts.
     */
    private void renderDeliveryLabel(
            String batchCode,
            String supplierCode,
            String date,
            String tempLine,
            String bornIn,
            String rearedIn,
            String slaughterSite,
            String cutSite,
            String species,
            String allergens
    ) {
        if (printerService == null) {
            Log.w(TAG, "renderDeliveryLabel called but service not bound");
            return;
        }
        try {
            // ── Label mode (52×38mm die-cut, gap-fed) — ADR-0012 ──────────────
            // Receipt mode treated the roll as one endless strip and overran each
            // sticker. Label mode uses the gap sensor: locate to the start of the
            // next die-cut label, render inside it, then output/feed to the gap so
            // the next print starts clean on the next sticker. No lineWrap(3) tail
            // (that was the receipt-mode overrun); no enterPrinterBuffer wrap
            // (label mode commits per locate/output — calibration variable, add
            // back only if on-device shows torn/partial prints).
            //
            // NOTE: the Sunmi SDK (printerlibrary 1.0.24) has NO "set label mode"
            // call — there is no setPrinterMode and no WoyouConsts label constant
            // (verified against the AAR). labelLocate()/labelOutput() ARE the label
            // operations; the printer's own mode/gap handling does the rest. If the
            // printer isn't in label mode, getPrinterMode() can be checked on-device.
            printerService.printerInit(null);
            printerService.labelLocate();

            // All rows use printColumnsString — the printer lays each field into a
            // fixed CHARACTER column with its own alignment (no manual space-pad,
            // which overflowed at large fonts). Column widths sum to 32 = the 58mm
            // line capacity at the standard font. Tuned on-device for 52×38mm.
            printerService.setAlignment(0, null);

            // Row 1: SPECIES (left) + BATCH (right-aligned), bold.
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.ENABLE);
            printCols(new String[]{ species.toUpperCase(), batchCode },
                      new int[]{ 13, 19 }, new int[]{ 0, 2 });
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.DISABLE);

            // Barcode: CODE128 of batch, height 40 dots, text below.
            printerService.setAlignment(1, null);
            printerService.printBarCode(batchCode, 8, 40, 2, 2, null);
            printerService.lineWrap(1, null);
            printerService.setAlignment(0, null);

            // Body — paired columns (sum 32); date column wider so it never wraps.
            printCols(new String[]{ "Sup: " + supplierCode, "Date: " + date },
                      new int[]{ 13, 19 }, new int[]{ 0, 0 });

            String bornCell = (bornIn != null && !bornIn.isEmpty()) ? "Born: " + bornIn : "";
            printCols(new String[]{ "Temp: " + tempLine, bornCell },
                      new int[]{ 16, 16 }, new int[]{ 0, 0 });

            String rearedCell = (rearedIn != null && !rearedIn.isEmpty()) ? "Reared: " + rearedIn : "";
            String slCell     = (slaughterSite != null && !slaughterSite.isEmpty()) ? "Sl: " + slaughterSite : "";
            if (!rearedCell.isEmpty() || !slCell.isEmpty()) {
                printCols(new String[]{ rearedCell, slCell },
                          new int[]{ 16, 16 }, new int[]{ 0, 0 });
            }

            String cutCell = (cutSite != null && !cutSite.isEmpty()) ? "Cut: " + cutSite : "";
            if (!cutCell.isEmpty()) {
                printerService.printText(cutCell + "\n", null);
            }

            String allergensText = (allergens == null || allergens.isEmpty()) ? "None" : allergens;
            printerService.printText("Allergens: " + allergensText + "\n", null);

            printerService.labelOutput();
            Log.d(TAG, "Printed: " + batchCode);
        } catch (Exception e) {
            Log.e(TAG, "Print error: " + e.getMessage(), e);
        }
    }

    /**
     * Print one row as fixed-width CHARACTER columns via the Sunmi column API,
     * which lays each field into its own width with its own alignment (0=left,
     * 1=centre, 2=right) and wraps within a column instead of overrunning the
     * line. Widths are in character units summing to ~32 for the 58mm head at the
     * standard font. Replaces the old manual space-pad, which overflowed at large
     * fonts (ADR-0012; tuned on-device for 52×38mm die-cut stock).
     */
    private void printCols(String[] texts, int[] widths, int[] aligns) throws android.os.RemoteException {
        printerService.printColumnsString(texts, widths, aligns, null);
    }

    public void unregister() {
        try {
            if (printerService != null) {
                InnerPrinterManager.getInstance().unBindService(context, innerCallback);
            }
        } catch (InnerPrinterException e) {
            Log.e(TAG, "unBindService failed: " + e.getMessage());
        }
    }
}
