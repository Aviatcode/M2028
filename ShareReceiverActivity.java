package com.example.m2028;   // <- change to your applicationId

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.util.UUID;

/** Receives Share-sheet content, writes it to a private inbox, finishes. Never starts MainActivity. */
public class ShareReceiverActivity extends Activity {
    static final long MAX = 25_000_000L; // same cap as the app (Gmail attachment limit)

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        int saved = 0, rejected = 0;
        try {
            Intent in = getIntent();
            File dir = new File(getFilesDir(), "share_inbox"); dir.mkdirs();
            String text = in.getStringExtra(Intent.EXTRA_TEXT), title = in.getStringExtra(Intent.EXTRA_SUBJECT);
            java.util.List<Uri> uris = new java.util.ArrayList<>();
            ClipData cd = in.getClipData();
            if (cd != null) for (int i = 0; i < cd.getItemCount(); i++) if (cd.getItemAt(i).getUri() != null) uris.add(cd.getItemAt(i).getUri());
            if (uris.isEmpty()) { Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) uris.add(u); }
            if (uris.isEmpty()) { if (text != null) { write(dir, title, text, null, null, null); saved++; } }
            for (Uri u : uris) {
                String name = "shared", mime = getContentResolver().getType(u); long size = -1;
                try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
                    if (c != null && c.moveToFirst()) { int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), s = c.getColumnIndex(OpenableColumns.SIZE);
                        if (n >= 0) name = c.getString(n); if (s >= 0 && !c.isNull(s)) size = c.getLong(s); } }
                if (size > MAX) { rejected++; continue; }
                String id = UUID.randomUUID().toString(); File f = new File(dir, id + ".bin");
                try (InputStream is = getContentResolver().openInputStream(u); OutputStream os = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536]; long tot = 0; int r;
                    while ((r = is.read(buf)) > 0) { tot += r; if (tot > MAX) break; os.write(buf, 0, r); }
                    if (tot > MAX) { f.delete(); rejected++; continue; }
                }
                write(dir, title, text, name, mime, id); saved++;
            }
        } catch (Exception e) { /* fall through to toast */ }
        Toast.makeText(this, saved > 0 ? "Saved to Notes" + (rejected > 0 ? " (" + rejected + " too large)" : "")
                : rejected > 0 ? "File too large (25 MB max)" : "Could not save", Toast.LENGTH_SHORT).show();
        finish(); // main app is never opened
    }

    private void write(File dir, String title, String text, String name, String mime, String fileId) throws Exception {
        JSONObject j = new JSONObject();
        j.put("title", title == null ? "" : title); j.put("text", text == null ? "" : text);
        j.put("name", name == null ? "" : name); j.put("mime", mime == null ? "" : mime); j.put("file", fileId == null ? "" : fileId + ".bin");
        try (FileWriter w = new FileWriter(new File(dir, UUID.randomUUID() + ".json"))) { w.write(j.toString()); }
    }
}
