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
            String bornLine,
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
            printerService.printerInit(null);
            printerService.enterPrinterBuffer(true);

            printerService.setAlignment(0, null);
            printerService.setFontSize(18, null);
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.ENABLE);
            printerService.printText("MFS GLOBAL  GOODS IN\n", null);
            printerService.setFontSize(22, null);
            printerService.printText(species.toUpperCase() + "\n", null);
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.DISABLE);

            printerService.setFontSize(26, null);
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.ENABLE);
            printerService.printText(batchCode + "\n", null);
            printerService.setPrinterStyle(WoyouConsts.ENABLE_BOLD, WoyouConsts.DISABLE);

            printerService.setAlignment(1, null);
            printerService.printBarCode(batchCode, 8, 80, 2, 2, null);
            printerService.lineWrap(1, null);

            printerService.setAlignment(0, null);
            printerService.setFontSize(20, null);
            printerService.printText("--------------------------------\n", null);
            printerService.printText("Supplier: " + supplierCode + "\n", null);
            printerService.printText("Date:     " + date + "\n", null);
            printerService.printText("Temp:     " + tempLine + "\n", null);
            if (bornLine != null && !bornLine.isEmpty()) {
                printerService.printText(bornLine + "\n", null);
            }
            if (slaughterSite != null && !slaughterSite.isEmpty()) {
                printerService.printText("Sl:       " + slaughterSite + "\n", null);
            }
            if (cutSite != null && !cutSite.isEmpty()) {
                printerService.printText("Cut:      " + cutSite + "\n", null);
            }
            String allergensText = (allergens == null || allergens.isEmpty()) ? "None" : allergens;
            printerService.printText("Allergens: " + allergensText + "\n", null);
            printerService.lineWrap(3, null);

            printerService.exitPrinterBuffer(true);
            Log.d(TAG, "Printed: " + batchCode);
        } catch (Exception e) {
            Log.e(TAG, "Print error: " + e.getMessage(), e);
        }
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
