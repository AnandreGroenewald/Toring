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
 * the topic "stapel" (its own: topics are shared by every app in the project), so one message from the Firebase
 * console reaches every player. Until then Firebase stays asleep (the manifest turns its automatic start off), so
 * nothing is made or sent.
 */
@CapacitorPlugin(name = "StapelPush")
public class StapelPushPlugin extends Plugin {
    @PluginMethod
    public void join(PluginCall call) {
        String topic = call.getString("topic", "stapel");
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

    /**
     * (28 Oct 2026) A topic left: app/shim.js keeps each phone on its game language's news ("stapel-af" or "stapel-en")
     * and takes it off the other one's when the player changes language.
     */
    @PluginMethod
    public void leave(PluginCall call) {
        String topic = call.getString("topic", "");
        JSObject out = new JSObject();
        if (topic == null || topic.isEmpty()) {
            out.put("left", false);
            call.resolve(out);
            return;
        }
        try {
            FirebaseMessaging.getInstance().unsubscribeFromTopic(topic).addOnCompleteListener(task -> {
                out.put("left", task.isSuccessful());
                call.resolve(out);
            });
        } catch (RuntimeException e) {
            call.reject("Firebase is not set up", "no_firebase");
        }
    }
}
