package com.mfsglobal.ops;

import android.content.Context;
import android.util.Log;
import android.webkit.JavascriptInterface;

import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterException;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.SunmiPrinterService;
import com.sunmi.peripheral.printer.WoyouConsts;

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

    @JavascriptInterface
    public void printDeliveryLabel(
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
            Log.w(TAG, "printDeliveryLabel called but service not bound");
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
            printerService.printerInit(null);
            printerService.setPrinterMode(WoyouConsts.PRINTER_LABEL_MODE);
            printerService.labelLocate();

            // Row 1: SPECIES + BATCH side-by-side, bold (fixed-width pad to columns).
            printerService.setAlignment(0, null);
            printerService.setFontSize(30, null);
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.ENABLE);
            printerService.printText(twoCol(species.toUpperCase(), batchCode), null);
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.DISABLE);

            // Barcode: CODE128 of batch, height 40 dots (down from 80), text below.
            printerService.setAlignment(1, null);
            printerService.printBarCode(batchCode, 8, 40, 2, 2, null);
            printerService.lineWrap(1, null);

            // Two-column body (paired to fit the ~270-dot height budget).
            printerService.setAlignment(0, null);
            printerService.setFontSize(20, null);
            printerService.printText(twoCol("Supplier: " + supplierCode, "Date: " + date), null);

            String tempCell  = "Temp: " + tempLine;
            String bornCell  = (bornIn != null && !bornIn.isEmpty()) ? "Born: " + bornIn : "";
            printerService.printText(twoCol(tempCell, bornCell), null);

            String rearedCell = (rearedIn != null && !rearedIn.isEmpty()) ? "Reared: " + rearedIn : "";
            String slCell     = (slaughterSite != null && !slaughterSite.isEmpty()) ? "Sl: " + slaughterSite : "";
            if (!rearedCell.isEmpty() || !slCell.isEmpty()) {
                printerService.printText(twoCol(rearedCell, slCell), null);
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
     * Lay two fields side-by-side on one row by padding the left field to a fixed
     * character column then appending the right field. The column width (24 chars)
     * is a starting value tuned on-device against the 52×38mm stock (ADR-0012).
     */
    private static String twoCol(String left, String right) {
        if (left == null) left = "";
        if (right == null) right = "";
        final int col = 24;
        if (right.isEmpty()) {
            return left + "\n";
        }
        StringBuilder sb = new StringBuilder(left);
        while (sb.length() < col) {
            sb.append(' ');
        }
        sb.append(right).append('\n');
        return sb.toString();
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
