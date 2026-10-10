package com.diplay.tesla

import android.app.Application
import com.shilapi.xcertplay.CarPlayOutput

class TeslaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        TeslaLocaleDefault.apply(this)
        CarPlayOutput.extension = TeslaBrowserOutput(this).also { it.start() }
    }
}
