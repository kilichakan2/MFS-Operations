package com.mfsglobal.ops;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private SunmiPrintBridge sunmiPrintBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
        WebView webView = this.bridge.getWebView();
        sunmiPrintBridge = new SunmiPrintBridge(this);
        webView.addJavascriptInterface(sunmiPrintBridge, "MFSSunmiPrint");
        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://mfsops.com") || url.startsWith("https://www.mfsops.com")) {
                    view.loadUrl(url);
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }

    @Override
    public void onDestroy() {
        if (sunmiPrintBridge != null) sunmiPrintBridge.unregister();
        super.onDestroy();
    }
}
