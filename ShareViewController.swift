import UIKit
import UniformTypeIdentifiers

// Share Extension principal class. Saves to the shared App Group container, confirms, completes. The host app is NOT launched.
// 1) Enable App Groups on the app + extension targets. 2) Set `group` below. 3) NSExtensionActivationRule: enable text, URL, image, file.
class ShareViewController: UIViewController {
    let group = "group.com.example.m2028"      // <- change
    let maxBytes = 25_000_000                    // same cap as the app (Gmail attachment limit)

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let items = extensionContext?.inputItems as? [NSExtensionItem],
              let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("share_inbox") else { return finish("Could not save") }
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let providers = items.flatMap { $0.attachments ?? [] }
        let title = items.first?.attributedContentText?.string ?? ""
        var saved = 0, rejected = 0; let dg = DispatchGroup()
        for p in providers {
            let types: [UTType] = [.url, .image, .pdf, .data, .plainText]
            guard let t = types.first(where: { p.hasItemConformingToTypeIdentifier($0.identifier) }) else { continue }
            dg.enter()
            p.loadItem(forTypeIdentifier: t.identifier, options: nil) { item, _ in
                defer { dg.leave() }
                let id = UUID().uuidString; var meta: [String: String] = ["title": title, "text": "", "url": "", "name": "", "mime": "", "file": ""]
                if let u = item as? URL, !u.isFileURL { meta["url"] = u.absoluteString }
                else if let s = item as? String { meta["text"] = s }
                else if let u = item as? URL, let d = try? Data(contentsOf: u, options: .mappedIfSafe) {
                    if d.count > self.maxBytes { rejected += 1; return }
                    try? d.write(to: base.appendingPathComponent(id + ".bin")); meta["file"] = id + ".bin"; meta["name"] = u.lastPathComponent
                    meta["mime"] = UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                } else if let img = item as? UIImage, let d = img.jpegData(compressionQuality: 0.92) {
                    if d.count > self.maxBytes { rejected += 1; return }
                    try? d.write(to: base.appendingPathComponent(id + ".bin")); meta["file"] = id + ".bin"; meta["name"] = "image.jpg"; meta["mime"] = "image/jpeg"
                } else { return }
                if let j = try? JSONSerialization.data(withJSONObject: meta) { try? j.write(to: base.appendingPathComponent(UUID().uuidString + ".json")); saved += 1 }
            }
        }
        dg.notify(queue: .main) { self.finish(saved > 0 ? "Saved to Notes" : (rejected > 0 ? "File too large (25 MB max)" : "Nothing to save")) }
    }
    func finish(_ msg: String) {
        let l = UILabel(); l.text = msg; l.textAlignment = .center; l.textColor = .white; l.backgroundColor = UIColor(white: 0, alpha: 0.8)
        l.layer.cornerRadius = 12; l.clipsToBounds = true; l.frame = CGRect(x: 0, y: 0, width: 220, height: 48); l.center = view.center; view.addSubview(l)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.extensionContext?.completeRequest(returningItems: nil) }
    }
}
// Main-app plugin (not included): a Capacitor plugin `ShareInbox` with drain()/ack() that reads the same App Group `share_inbox`
// folder and returns [{title,text,url,name,mime,base64}] exactly like the Android plugin.
