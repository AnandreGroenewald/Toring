package com.lekkerlocal.stapel;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.activity.EdgeToEdge;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // (1.12.1) Android 7-14 draw the game under see-through status and navigation bars too, as Android 15+ does
        // by itself (Capacitor's system bars note asks for this): else those bars kept the theme's grey or black,
        // with the dark clock and buttons hard to read on it
        // (1.13.3, the owner on the Play app 1.13.2: "the Stapel on the top, please remove that. It needs to be the game only")
        // the game's theme (no title bar) first: EdgeToEdge builds the window, and with the launch theme still on it
        // showed a "Stapel" title bar (the launch picture as its background) above the game. BridgeActivity sets this
        // theme again after super.onCreate; Android 12+'s launch screen comes from the manifest theme, before this runs.
        setTheme(R.style.AppTheme_NoActionBar);
        EdgeToEdge.enable(this);
        // (1.14) Sign in with Google: the app's own plugin (StapelGooglePlugin), registered before the bridge starts
        registerPlugin(StapelGooglePlugin.class);
        // (27 Oct 2026) News on the phone: Firebase Cloud Messaging, only once the player allows notifications
        registerPlugin(StapelPushPlugin.class);
        super.onCreate(savedInstanceState);
        hideNavigationBar();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideNavigationBar();
    }

    // back from Google's sign-in sheet, a notification shade or another window: the bar goes again
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideNavigationBar();
    }

    /**
     * (1.15.5, the owner: "Look at the controls at the bottom, is there no way that we can hide it"; on some phones
     * the see-through Back/Home/Recents sat on the game's bottom row of buttons) the navigation bar stays hidden while
     * the game shows, as games do: a swipe up from the bottom edge brings it back for a moment, over the game, and it
     * goes again by itself. The clock and battery at the top stay.
     */
    private void hideNavigationBar() {
        hideNavigationBarNow();
        // once more after work already queued: Capacitor's SystemBars plugin queues a "show the bars" while it starts
        mainThread.post(this::hideNavigationBarNow);
    }

    private final Handler mainThread = new Handler(Looper.getMainLooper());

    private void hideNavigationBarNow() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.navigationBars());
    }
}
