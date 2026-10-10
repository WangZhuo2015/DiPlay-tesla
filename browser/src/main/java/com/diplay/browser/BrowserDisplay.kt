package com.diplay.browser

enum class BrowserMode { RIGHT, FULL }

/** Pixel sizes are negotiated with the iPhone, independent of the Android host window. */
data class BrowserResolution(val width: Int, val height: Int) {
    init {
        require(width in 320..2560 && height in 240..1440 && width % 2 == 0 && height % 2 == 0)
    }
    override fun toString() = "${width}×${height}"
}

data class BrowserDisplay(
    val mode: BrowserMode = BrowserMode.RIGHT,
    val right: BrowserResolution = BrowserResolution(1024, 768),
    val full: BrowserResolution = BrowserResolution(1920, 1080),
    val fps: Int = 20,
    val jpegQuality: Int = 80,
) {
    init { require(fps in 5..30 && jpegQuality in 40..95) }
    val resolution: BrowserResolution get() = if (mode == BrowserMode.RIGHT) right else full
}
