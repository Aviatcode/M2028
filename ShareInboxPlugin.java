package com.example.m2028;

import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;

/** Capacitor plugin: lets notes.js read what ShareReceiverActivity saved. Register in MainActivity: registerPlugin(ShareInboxPlugin.class) */
@CapacitorPlugin(name = "ShareInbox")
public class ShareInboxPlugin extends Plugin {
    private final java.util.List<File> drained = new java.util.ArrayList<>();

    @PluginMethod public void drain(PluginCall call) {
        JSArray items = new JSArray(); drained.clear();
        File dir = new File(getContext().getFilesDir(), "share_inbox");
        File[] fs = dir.listFiles((d, n) -> n.endsWith(".json"));
        if (fs != null) for (File jf : fs) {
            try {
                JSONObject j = new JSONObject(new String(Files.readAllBytes(jf.toPath())));
                JSObject o = new JSObject(); o.put("title", j.optString("title")); o.put("text", j.optString("text")); o.put("name", j.optString("name")); o.put("mime", j.optString("mime"));
                String fn = j.optString("file");
                if (!fn.isEmpty()) { File bf = new File(dir, fn); o.put("base64", Base64.encodeToString(Files.readAllBytes(bf.toPath()), Base64.NO_WRAP)); drained.add(bf); }
                items.put(o); drained.add(jf);
            } catch (Exception ignored) {}
        }
        JSObject r = new JSObject(); r.put("items", items); call.resolve(r);
    }
    /** Delete only after the app has persisted the items to IndexedDB. */
    @PluginMethod public void ack(PluginCall call) { for (File f : drained) f.delete(); drained.clear(); call.resolve(); }
}
