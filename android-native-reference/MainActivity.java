package com.chemchat.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

// `npx cap add android` ishga tushirgandan keyin bu faylni
// android/app/src/main/java/com/chemchat/app/MainActivity.java ustiga
// (paket nomini o'zingiznikiga moslab) qo'ying.
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // FLAG_SECURE - tizim darajasida ishlaydi:
        // - skrinshot olinsa qora ekran chiqadi
        // - ekran yozib olish (screen recording) ishlamaydi
        // - ilovalar ro'yxatida (recent apps) oldindan ko'rish qora bo'ladi
        // - ekranni ulashish/kasting bloklanadi
        // super.onCreate() dan OLDIN chaqirilishi shart.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        super.onCreate(savedInstanceState);
    }
}
