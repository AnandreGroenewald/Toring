package com.lekkerlocal.stapel;

import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.security.SecureRandom;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Sign in with Google (1.13): the phone's own Google sign-in (Android Credential Manager), because Google
 * doesn't allow its sign-in inside a WebView. js/account.js calls it through app/shim.js
 * (window.stapelApp.google). It hands back only Google's ID token, which the game's server checks; the
 * token is asked for the web client ID (the same one the website uses), so one server check fits both.
 * Errors come back with a code: "canceled" (the player closed it), "no_account" (no Google account on the
 * phone), or "error".
 */
@CapacitorPlugin(name = "StapelGoogle")
public class StapelGooglePlugin extends Plugin {
    private final Executor executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId", "");
        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("no client id", "error");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce()).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(getActivity(), request, null, executor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (credential instanceof CustomCredential
                        && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        try {
                            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                            JSObject out = new JSObject();
                            out.put("idToken", google.getIdToken());
                            call.resolve(out);
                        } catch (Exception e) {
                            call.reject("unreadable credential", "error");
                        }
                    } else {
                        call.reject("unexpected credential", "error");
                    }
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) call.reject("canceled", "canceled");
                    else if (e instanceof NoCredentialException) call.reject("no account", "no_account");
                    else call.reject(e.getClass().getSimpleName(), "error");
                }
            });
    }

    /** Forget the sign-in on this phone (signing out of Stapel; the Google account itself stays). */
    @PluginMethod
    public void signOut(PluginCall call) {
        CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(), null, executor,
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void result) {
                    call.resolve();
                }

                @Override
                public void onError(@NonNull ClearCredentialException e) {
                    call.resolve();
                }
            });
    }

    private static String nonce() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING);
    }
}
