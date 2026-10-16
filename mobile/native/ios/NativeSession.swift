// Appended to the generated AppDelegate.swift by prepare-native.mjs.
import Security

@objc(NativeSessionPlugin)
public class NativeSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeSessionPlugin"
    public let jsName = "NativeSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "cn.okekxf.growth") + ".session.v1",
         kSecAttrAccount as String: "session"]
    }
    @objc func get(_ call: CAPPluginCall) {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["token": ""]); return }
        guard status == errSecSuccess, let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("无法读取安全会话，请解锁设备后重试。", "SESSION_READ_FAILED"); return
        }
        call.resolve(["token": token])
    }
    @objc func set(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty, token.count <= 4096 else {
            call.reject("Invalid session"); return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            attributes.forEach { item[$0.key] = $0.value }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        if status == errSecSuccess { call.resolve() }
        else { call.reject("无法保存安全会话。", "SESSION_WRITE_FAILED") }
    }
    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() }
        else { call.reject("无法清除安全会话。", "SESSION_CLEAR_FAILED") }
    }
}

class GrowthViewController: CAPBridgeViewController {
    #if DEBUG
    private var smokeStarted = false
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !smokeStarted && ProcessInfo.processInfo.arguments.contains("--native-smoke") {
            smokeStarted = true
            runSmoke(attempt: 0)
        }
    }
    private func runSmoke(attempt: Int) {
        let script = """
        (()=>{
          if(!window.MobileBridge || !window.ClubUI)return 'waiting';
          if(!window.__nativeSmoke){
            window.__nativeSmoke='pending';
            window.MobileBridge.saveToken('smoke-test-not-a-real-session')
              .then(()=>window.MobileBridge.getToken())
              .then(t=>{if(t!=='smoke-test-not-a-real-session')throw Error('read mismatch');return window.MobileBridge.clearToken();})
              .then(()=>window.MobileBridge.getToken())
              .then(t=>{if(t!=='')throw Error('clear mismatch');window.__nativeSmoke='pass';})
              .catch(e=>window.__nativeSmoke='fail:'+e.message);
          }
          return window.__nativeSmoke;
        })()
        """
        webView?.evaluateJavaScript(script) { [weak self] value, error in
            let result = value as? String ?? "waiting"
            if result == "pass" || result.hasPrefix("fail:") || attempt >= 150 {
                let output = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-smoke-result.txt")
                try? (result == "pass" ? "pass" : "fail: " + result).write(to: output, atomically: true, encoding: .utf8)
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self?.runSmoke(attempt: attempt + 1) }
            }
        }
    }
    #endif
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSessionPlugin())
    }
}
