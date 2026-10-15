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

@objc(GrowthViewController)
class GrowthViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSessionPlugin())
    }
}
