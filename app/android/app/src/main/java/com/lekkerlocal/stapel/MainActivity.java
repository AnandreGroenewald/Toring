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
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
