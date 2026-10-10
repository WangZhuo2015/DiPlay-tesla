// SPDX-License-Identifier: AGPL-3.0-only
// CN language fallback adapted from serein-morii/DiPlay-CN; see docs/TESLA.md.
package com.diplay.tesla

import android.content.Context
import com.shilapi.xcertplay.AppLocale

internal object TeslaLocaleDefault {
    fun apply(context: Context) {
        val prefs = context.getSharedPreferences("tesla-browser", Context.MODE_PRIVATE)
        if (prefs.getBoolean("language-default-applied", false)) return
        val language = context.resources.configuration.locales[0].language
        if (language !in setOf("en", "zh", "ar", "ru", "uk", "es") && AppLocale.preference(context) == AppLocale.SYSTEM) {
            AppLocale.save(context, AppLocale.SIMPLIFIED_CHINESE)
        }
        prefs.edit().putBoolean("language-default-applied", true).apply()
    }
}
