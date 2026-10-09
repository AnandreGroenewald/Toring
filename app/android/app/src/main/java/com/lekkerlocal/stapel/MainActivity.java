package com.lekkerlocal.stapel;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // (1.13) Sign in with Google: the app's own plugin (StapelGooglePlugin), registered before the bridge starts
        registerPlugin(StapelGooglePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
