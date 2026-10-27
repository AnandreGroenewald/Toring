package com.lekkerlocal.stapel;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * News on the phone (owner, 27 Oct 2026): Firebase Cloud Messaging, project "Lekker Local Games". app/shim.js calls
 * join once the player allows notifications (the same Android question as the daily reminder); the phone then joins
 * the topic, so one message from the Firebase console reaches every player. Until then Firebase stays asleep (the
 * manifest turns its automatic start off), so nothing is made or sent.
 */
@CapacitorPlugin(name = "StapelPush")
public class StapelPushPlugin extends Plugin {
    @PluginMethod
    public void join(PluginCall call) {
        String topic = call.getString("topic", "news");
        JSObject out = new JSObject();
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) {
            out.put("joined", false);
            call.resolve(out);
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(
                    new NotificationChannel("news", "Nuus / News", NotificationManager.IMPORTANCE_DEFAULT));
        }
        try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(true);
            messaging.subscribeToTopic(topic).addOnCompleteListener(task -> {
                out.put("joined", task.isSuccessful());
                call.resolve(out);
            });
        } catch (RuntimeException e) {
            call.reject("Firebase is not set up", "no_firebase");
        }
    }
}
