package com.lekkerlocal.stapel;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

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
        super.onCreate(savedInstanceState);
    }
}
