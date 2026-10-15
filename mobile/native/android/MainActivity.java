package cn.okekxf.growth;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
