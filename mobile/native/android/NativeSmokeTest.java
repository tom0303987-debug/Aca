package cn.okekxf.growth;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class NativeSmokeTest {
    private String evaluate(ActivityScenario<MainActivity> activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    @Test public void bundledAppStartsAndSecureSessionRoundTrips() throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            boolean ready = false;
            for (int i=0; i<150; i++) {
                if ("true".equals(evaluate(activity, "Boolean(window.MobileBridge && window.ClubUI && document.getElementById('auth-submit'))"))) { ready=true; break; }
                Thread.sleep(100);
            }
            assertTrue("Bundled app did not initialize", ready);
            assertEquals("true", evaluate(activity, "window.MobileBridge.isNative"));
            evaluate(activity, "window.__nativeSmoke='pending';window.MobileBridge.saveToken('smoke-test-not-a-real-session').then(()=>window.MobileBridge.getToken()).then(t=>{if(t!=='smoke-test-not-a-real-session')throw Error('read mismatch');return window.MobileBridge.clearToken();}).then(()=>window.MobileBridge.getToken()).then(t=>{if(t!=='')throw Error('clear mismatch');window.__nativeSmoke='pass';}).catch(e=>window.__nativeSmoke='fail:'+e.message);");
            String result = "";
            for (int i=0; i<150; i++) {
                result=evaluate(activity,"window.__nativeSmoke");
                if (!"\"pending\"".equals(result)) break;
                Thread.sleep(100);
            }
            assertEquals("\"pass\"",result);
            assertEquals("\"rgb(220, 226, 241)\"",evaluate(activity,"getComputedStyle(document.body).backgroundColor"));
        }
    }
}
